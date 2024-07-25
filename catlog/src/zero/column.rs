//! Data structures for mappings and columns, as found in data tables.

use std::collections::HashMap;
use std::hash::{BuildHasher, BuildHasherDefault, Hash, RandomState};
use std::marker::PhantomData;

use derivative::Derivative;
use derive_more::From;
use nonempty::NonEmpty;
use thiserror::Error;
use ustr::{IdentityHasher, Ustr};

use super::set::{FinSet, Set};
use crate::validate::{self, Validate};

/** A functional mapping.

A mapping takes values of type [`Dom`](Self::Dom) to values of type
[`Cod`](Self::Cod). Unlike a function, a mapping need not be defined on its
whole domain. A mapping is thus more like a partial function, but it does not
actually know its domain of definition. If needed, that information should be
provided separately, preferably as a [`Set`].

Neither the domain nor the codomain of the mapping are assumed to be finite.
 */
pub trait Mapping {
    /// Type of elements in domain of mapping.
    type Dom: Eq;

    /// Type of elements in codomain of mapping.
    type Cod: Eq;

    /// Applies the mapping at a point possibly in the domain.
    fn apply(&self, x: &Self::Dom) -> Option<&Self::Cod>;

    /** Sets the mapping at a point.

    The old value is returned, if one was set.
    */
    fn set(&mut self, x: Self::Dom, y: Self::Cod) -> Option<Self::Cod>;

    /** Un-sets the mapping at a point, making it undefined at that point.

    The old value is returned, if one was set.
    */
    fn unset(&mut self, x: &Self::Dom) -> Option<Self::Cod>;

    /** Updates the mapping at a point, setting or unsetting it.

    The old value is returned, if one was set.
     */
    fn update(&mut self, x: Self::Dom, maybe_y: Option<Self::Cod>) -> Option<Self::Cod> {
        match maybe_y {
            Some(y) => self.set(x, y),
            None => self.unset(&x),
        }
    }

    /// Is the mapping defined at a point?
    fn is_set(&self, x: &Self::Dom) -> bool {
        self.apply(x).is_some()
    }
}

/** A mapping with finite support.

While its domain and codomain can be infinite, such a mapping is defined at only
finitely many values in the domain. It is thus a "column of data", as found in
data tables and relational databases.
 */
pub trait Column: Mapping {
    /// Iterates over pairs stored by the column.
    fn iter(&self) -> impl Iterator<Item = (Self::Dom, &Self::Cod)>;

    /// Iterates over values stored by the column.
    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.iter().map(|(_, y)| y)
    }

    /** Computes the preimage of the mapping at a value in the codomain.

    Depending on whether the implementation maintains a reverse index for the
    mapping, this method can be cheap or expensive.
    */
    fn preimage(&self, y: &Self::Cod) -> impl Iterator<Item = Self::Dom> {
        self.iter().filter(|&(_, z)| *z == *y).map(|(x, _)| x)
    }
}

/** A function between sets defined by a [mapping](Mapping).

This struct borrows its data, and exists mainly as a convenient interface to
validate that a mapping defines a valid function.
 */
pub struct Function<'a, Map, Dom, Cod>(pub &'a Map, pub &'a Dom, pub &'a Cod);

impl<'a, Map, Dom, Cod> Function<'a, Map, Dom, Cod>
where
    Map: Mapping,
    Dom: FinSet<Elem = Map::Dom>,
    Cod: Set<Elem = Map::Cod>,
{
    /// Iterates over failures to be a function.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidFunction<Map::Dom>> + 'a {
        let Function(mapping, dom, cod) = self;
        dom.iter().filter_map(|x| match mapping.apply(&x) {
            Some(y) => {
                if cod.contains(y) {
                    None
                } else {
                    Some(InvalidFunction::Cod(x))
                }
            }
            None => Some(InvalidFunction::Dom(x)),
        })
    }
}

impl<Map, Dom, Cod> Validate for Function<'_, Map, Dom, Cod>
where
    Map: Mapping,
    Dom: FinSet<Elem = Map::Dom>,
    Cod: Set<Elem = Map::Cod>,
{
    type ValidationError = InvalidFunction<Map::Dom>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::collect_errors(self.iter_invalid())
    }
}

/// A failure of a mapping to restrict to a function between two sets.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum InvalidFunction<T> {
    /// The mapping is not defined at a point in the domain.
    #[error("Mapping not defined at point `{0}` in domain")]
    Dom(T),

    /// The image of a point in the domain is not contained in the codomain.
    #[error("Image of mapping at point `{0}` is not in codomain")]
    Cod(T),
}

impl<T> InvalidFunction<T> {
    pub(crate) fn take(self) -> T {
        match self {
            InvalidFunction::Dom(x) | InvalidFunction::Cod(x) => x,
        }
    }
}

/** An unindexed column backed by a vector.
 */
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
pub struct VecColumn<T>(Vec<Option<T>>);

impl<T> VecColumn<T> {
    /// Creates a vector-backed column by consuming an existing vector.
    pub fn new(values: Vec<T>) -> Self {
        Self(values.into_iter().map(Some).collect())
    }
}

impl<T: Eq> Mapping for VecColumn<T> {
    type Dom = usize;
    type Cod = T;

    fn apply(&self, i: &usize) -> Option<&T> {
        if *i < self.0.len() {
            self.0[*i].as_ref()
        } else {
            None
        }
    }

    fn set(&mut self, i: usize, y: T) -> Option<T> {
        if i >= self.0.len() {
            self.0.resize_with(i + 1, Default::default);
        }
        std::mem::replace(&mut self.0[i], Some(y))
    }

    fn unset(&mut self, i: &usize) -> Option<T> {
        if *i < self.0.len() {
            self.0[*i].take()
        } else {
            None
        }
    }

    fn is_set(&self, i: &usize) -> bool {
        *i < self.0.len() && self.0[*i].is_some()
    }
}

impl<T: Eq> Column for VecColumn<T> {
    fn iter(&self) -> impl Iterator<Item = (usize, &T)> {
        let filtered = self.0.iter().enumerate().filter(|(_, y)| y.is_some());
        filtered.map(|(i, y)| (i, y.as_ref().unwrap()))
    }

    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.0.iter().flatten()
    }
}

/** An unindexed column backed by a hash map.
 */
#[derive(Clone, From, Derivative)]
#[derivative(Default(bound = "S: Default"))]
pub struct HashColumn<K, V, S = RandomState>(HashMap<K, V, S>);

/// An unindexed column with keys of type `Ustr`.
pub type UstrColumn<V> = HashColumn<Ustr, V, BuildHasherDefault<IdentityHasher>>;

impl<K, V, S> Mapping for HashColumn<K, V, S>
where
    K: Eq + Hash,
    V: Eq,
    S: BuildHasher,
{
    type Dom = K;
    type Cod = V;

    fn apply(&self, x: &K) -> Option<&V> {
        self.0.get(x)
    }
    fn set(&mut self, x: K, y: V) -> Option<V> {
        self.0.insert(x, y)
    }
    fn unset(&mut self, x: &K) -> Option<V> {
        self.0.remove(x)
    }
    fn is_set(&self, x: &K) -> bool {
        self.0.contains_key(x)
    }
}

impl<K, V, S> Column for HashColumn<K, V, S>
where
    K: Eq + Hash + Clone,
    V: Eq,
    S: BuildHasher,
{
    fn iter(&self) -> impl Iterator<Item = (K, &V)> {
        self.0.iter().map(|(k, v)| (k.clone(), v))
    }

    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.0.values()
    }
}

/** An index in a column.

An index is a cache of preimages of a mapping, like an index in a relational
database. For the time being, indices are not a public interface, just a
convenient abstraction for implementing columns.
*/
trait Index {
    type Dom;
    type Cod;

    /// Gets the cached preimage.
    fn preimage(&self, y: &Self::Cod) -> impl Iterator<Item = Self::Dom>;

    /// Inserts a new pair into the index.
    fn insert(&mut self, x: Self::Dom, y: &Self::Cod);

    /** Removes a pair from the index.

    Assumes that the pair is already indexed, and may panic if not.
     */
    fn remove(&mut self, x: &Self::Dom, y: &Self::Cod);
}

/** An index implemented as a vector of vectors.
 */
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
struct VecIndex<T>(Vec<Vec<T>>);

impl<T: Eq + Clone> Index for VecIndex<T> {
    type Dom = T;
    type Cod = usize;

    fn preimage(&self, y: &usize) -> impl Iterator<Item = T> {
        let iter = match self.0.get(*y) {
            Some(vec) => vec.iter(),
            None => ([] as [T; 0]).iter(),
        };
        iter.cloned()
    }

    fn insert(&mut self, x: T, y: &usize) {
        let i = *y;
        if i >= self.0.len() {
            self.0.resize_with(i + 1, Default::default);
        }
        self.0[i].push(x);
    }

    fn remove(&mut self, x: &T, y: &usize) {
        let vec = &mut self.0[*y];
        let i = vec.iter().rposition(|w| *w == *x).unwrap();
        vec.remove(i);
    }
}

/** An index implemented by a hash map into vectors.
 */
#[derive(Clone, Derivative)]
#[derivative(Default(bound = "S: Default"))]
struct HashIndex<X, Y, S = RandomState>(HashMap<Y, Vec<X>, S>);

impl<X, Y, S> Index for HashIndex<X, Y, S>
where
    X: Eq + Clone,
    Y: Eq + Hash + Clone,
    S: BuildHasher,
{
    type Dom = X;
    type Cod = Y;

    fn preimage(&self, y: &Y) -> impl Iterator<Item = X> {
        let iter = match self.0.get(y) {
            Some(vec) => vec.iter(),
            None => ([] as [X; 0]).iter(),
        };
        iter.cloned()
    }

    fn insert(&mut self, x: X, y: &Y) {
        match self.0.get_mut(y) {
            Some(vec) => {
                vec.push(x);
            }
            None => {
                self.0.insert(y.clone(), vec![x]);
            }
        }
    }

    fn remove(&mut self, x: &X, y: &Y) {
        let vec = self.0.get_mut(y).unwrap();
        let i = vec.iter().rposition(|w| *w == *x).unwrap();
        vec.remove(i);
    }
}

/** An indexed column comprising a forward mapping and a separate index.

This common pattern is used to implement more specific columns but, like the
`Index` trait, is not directly exposed.
 */
#[derive(Clone)]
struct IndexedColumn<Dom, Cod, Col, Ind> {
    mapping: Col,
    index: Ind,
    dom_type: PhantomData<Dom>,
    cod_type: PhantomData<Cod>,
}

impl<Dom, Cod, Col, Ind> Default for IndexedColumn<Dom, Cod, Col, Ind>
where
    Col: Default,
    Ind: Default,
{
    fn default() -> Self {
        Self {
            mapping: Default::default(),
            index: Default::default(),
            dom_type: PhantomData,
            cod_type: PhantomData,
        }
    }
}

impl<Dom, Cod, Col, Ind> Mapping for IndexedColumn<Dom, Cod, Col, Ind>
where
    Dom: Eq + Clone,
    Cod: Eq,
    Col: Column<Dom = Dom, Cod = Cod>,
    Ind: Index<Dom = Dom, Cod = Cod>,
{
    type Dom = Dom;
    type Cod = Cod;

    fn apply(&self, x: &Dom) -> Option<&Cod> {
        self.mapping.apply(x)
    }

    fn is_set(&self, x: &Dom) -> bool {
        self.mapping.is_set(x)
    }

    fn set(&mut self, x: Dom, y: Cod) -> Option<Cod> {
        let old = self.unset(&x);
        self.index.insert(x.clone(), &y);
        self.mapping.set(x, y);
        old
    }

    fn unset(&mut self, x: &Dom) -> Option<Cod> {
        let old = self.mapping.unset(x);
        if let Some(ref y) = old {
            self.index.remove(x, y);
        }
        old
    }
}

impl<Dom, Cod, Col, Ind> Column for IndexedColumn<Dom, Cod, Col, Ind>
where
    Dom: Eq + Clone,
    Cod: Eq,
    Col: Column<Dom = Dom, Cod = Cod>,
    Ind: Index<Dom = Dom, Cod = Cod>,
{
    fn iter(&self) -> impl Iterator<Item = (Dom, &Cod)> {
        self.mapping.iter()
    }
    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.mapping.values()
    }
    fn preimage(&self, y: &Cod) -> impl Iterator<Item = Dom> {
        self.index.preimage(y)
    }
}

/** An indexed column backed by an integer-valued vector.

The column has the natural numbers (`usize`) as both its domain and codomain,
making it suitable for use with skeletal finite sets.
*/
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
pub struct SkelIndexedColumn(IndexedColumn<usize, usize, VecColumn<usize>, VecIndex<usize>>);

impl SkelIndexedColumn {
    /// Creates a new vector-backed column from an existing vector.
    pub fn new(values: &[usize]) -> Self {
        let mut col: Self = Default::default();
        for (x, y) in values.iter().enumerate() {
            col.set(x, *y);
        }
        col
    }
}

impl Mapping for SkelIndexedColumn {
    type Dom = usize;
    type Cod = usize;
    fn apply(&self, x: &usize) -> Option<&usize> {
        self.0.apply(x)
    }
    fn set(&mut self, x: usize, y: usize) -> Option<usize> {
        self.0.set(x, y)
    }
    fn unset(&mut self, x: &usize) -> Option<usize> {
        self.0.unset(x)
    }
    fn is_set(&self, x: &usize) -> bool {
        self.0.is_set(x)
    }
}

impl Column for SkelIndexedColumn {
    fn iter(&self) -> impl Iterator<Item = (usize, &usize)> {
        self.0.iter()
    }
    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.0.values()
    }
    fn preimage(&self, y: &usize) -> impl Iterator<Item = usize> {
        self.0.preimage(y)
    }
}

/** An indexed column backed by a vector.

The domain of the column is the natural numbers (`usize`). Since the codomain is
an arbitrary type (`T`), the index is implemented using a hash map.
*/
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
pub struct IndexedVecColumn<T>(IndexedColumn<usize, T, VecColumn<T>, HashIndex<usize, T>>);

impl<T: Eq + Hash + Clone> IndexedVecColumn<T> {
    /// Creates a new vector-backed column from an existing vector.
    pub fn new(values: &[T]) -> Self {
        let mut col: Self = Default::default();
        for (x, y) in values.iter().cloned().enumerate() {
            col.set(x, y);
        }
        col
    }
}

impl<T: Eq + Hash + Clone> Mapping for IndexedVecColumn<T> {
    type Dom = usize;
    type Cod = T;
    fn apply(&self, x: &usize) -> Option<&T> {
        self.0.apply(x)
    }
    fn set(&mut self, x: usize, y: T) -> Option<T> {
        self.0.set(x, y)
    }
    fn unset(&mut self, x: &usize) -> Option<T> {
        self.0.unset(x)
    }
    fn is_set(&self, x: &usize) -> bool {
        self.0.is_set(x)
    }
}

impl<T: Eq + Hash + Clone> Column for IndexedVecColumn<T> {
    fn iter(&self) -> impl Iterator<Item = (usize, &T)> {
        self.0.iter()
    }
    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.0.values()
    }
    fn preimage(&self, y: &T) -> impl Iterator<Item = usize> {
        self.0.preimage(y)
    }
}

/// An indexed column backed by hash maps.
#[derive(Clone, Derivative)]
#[derivative(Default(bound = "S: Default"))]
#[allow(clippy::type_complexity)]
pub struct IndexedHashColumn<K, V, S = RandomState>(
    IndexedColumn<K, V, HashColumn<K, V, S>, HashIndex<K, V, S>>,
);

/// An indexed column with keys and values of type `Ustr`.
#[allow(clippy::type_complexity)]
pub type IndexedUstrColumn = IndexedHashColumn<Ustr, Ustr, BuildHasherDefault<IdentityHasher>>;

impl<K, V, S> Mapping for IndexedHashColumn<K, V, S>
where
    K: Eq + Hash + Clone,
    V: Eq + Hash + Clone,
    S: BuildHasher,
{
    type Dom = K;
    type Cod = V;
    fn apply(&self, x: &K) -> Option<&V> {
        self.0.apply(x)
    }
    fn set(&mut self, x: K, y: V) -> Option<V> {
        self.0.set(x, y)
    }
    fn unset(&mut self, x: &K) -> Option<V> {
        self.0.unset(x)
    }
    fn is_set(&self, x: &K) -> bool {
        self.0.is_set(x)
    }
}

impl<K, V, S> Column for IndexedHashColumn<K, V, S>
where
    K: Eq + Hash + Clone,
    V: Eq + Hash + Clone,
    S: BuildHasher,
{
    fn iter(&self) -> impl Iterator<Item = (K, &V)> {
        self.0.iter()
    }
    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.0.values()
    }
    fn preimage(&self, y: &V) -> impl Iterator<Item = K> {
        self.0.preimage(y)
    }
}

#[cfg(test)]
mod tests {
    use super::super::set::SkelFinSet;
    use super::*;

    #[test]
    fn vec_column() {
        let mut col = VecColumn::new(vec!["foo", "bar", "baz"]);
        assert!(col.is_set(&2));
        assert_eq!(col.apply(&2), Some(&"baz"));
        assert_eq!(col.apply(&3), None);
        assert_eq!(col.update(2, None), Some("baz"));
        assert!(!col.is_set(&2));

        col.set(4, "baz");
        col.set(3, "bar");
        let preimage: Vec<_> = col.preimage(&"bar").collect();
        assert_eq!(preimage, vec![1, 3]);
    }

    #[test]
    fn hash_column() {
        let mut col: HashColumn<char, &str> = Default::default();
        col.set('a', "foo");
        col.set('b', "bar");
        col.set('c', "baz");
        assert_eq!(col.apply(&'c'), Some(&"baz"));
        assert_eq!(col.unset(&'c'), Some("baz"));
        assert!(!col.is_set(&'c'));
        col.set('c', "bar");

        let mut preimage: Vec<_> = col.preimage(&"bar").collect();
        preimage.sort();
        assert_eq!(preimage, vec!['b', 'c']);
    }

    #[test]
    fn skel_indexed_column() {
        let mut col = SkelIndexedColumn::new(&[1, 3, 5]);
        assert!(col.is_set(&2));
        assert_eq!(col.apply(&2), Some(&5));
        let preimage: Vec<_> = col.preimage(&5).collect();
        assert_eq!(preimage, vec![2]);

        assert_eq!(col.set(0, 5), Some(1));
        assert_eq!(col.preimage(&1).count(), 0);
        let mut preimage: Vec<_> = col.preimage(&5).collect();
        preimage.sort();
        assert_eq!(preimage, vec![0, 2]);
    }

    #[test]
    fn indexed_vec_column() {
        let mut col = IndexedVecColumn::new(&["foo", "bar", "baz"]);
        assert!(col.is_set(&2));
        assert_eq!(col.apply(&2), Some(&"baz"));
        let preimage: Vec<_> = col.preimage(&"baz").collect();
        assert_eq!(preimage, vec![2]);

        assert_eq!(col.set(0, "baz"), Some("foo"));
        assert_eq!(col.preimage(&"foo").count(), 0);
        let mut preimage: Vec<_> = col.preimage(&"baz").collect();
        preimage.sort();
        assert_eq!(preimage, vec![0, 2]);
    }

    #[test]
    fn indexed_hash_column() {
        let mut col: IndexedHashColumn<char, &str> = Default::default();
        col.set('a', "foo");
        col.set('b', "bar");
        col.set('c', "baz");
        assert_eq!(col.apply(&'c'), Some(&"baz"));
        let preimage: Vec<_> = col.preimage(&"baz").collect();
        assert_eq!(preimage, vec!['c']);

        assert_eq!(col.set('a', "baz"), Some("foo"));
        assert_eq!(col.preimage(&"foo").count(), 0);
        let mut preimage: Vec<_> = col.preimage(&"baz").collect();
        preimage.sort();
        assert_eq!(preimage, vec!['a', 'c']);
    }

    #[test]
    fn validate_function() {
        let col = VecColumn::new(vec![1, 2, 4]);
        let validate = |m, n| Function(&col, &SkelFinSet::from(m), &SkelFinSet::from(n)).validate();
        assert!(validate(3, 5).is_ok());
        assert_eq!(validate(4, 5).unwrap_err(), NonEmpty::new(InvalidFunction::Dom::<usize>(3)));
        assert_eq!(validate(3, 4).unwrap_err(), NonEmpty::new(InvalidFunction::Cod::<usize>(2)));
    }
}
