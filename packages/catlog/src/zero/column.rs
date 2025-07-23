//! Data structures for mappings and columns, as found in data tables.

use std::collections::HashMap;
use std::hash::Hash;
use std::marker::PhantomData;

use derivative::Derivative;
use derive_more::{Constructor, From};
use nonempty::NonEmpty;
use thiserror::Error;
use ustr::Ustr;

use super::set::{FinSet, Set, SkelFinSet};
use crate::validate::{self, Validate};

/** A functional mapping.

A mapping sends values of type [`Dom`](Self::Dom) to values of type
[`Cod`](Self::Cod). Unlike a function, a mapping need not be defined on its
whole domain. A mapping is thus more like a partial function, but it does not
even know its intended domain of definition, nor the codomain to which its image
should restrict. If needed, that information should be provided separately as
[sets](Set). Neither domain nor codomain are assumed to be finite.

This trait encompasses mappings that compute their values on the fly and
mappings that own their data, say in the form of a vector or hash map. Achieving
this flexiblity in Rust is delicate due to the sharp distinction between values
and references, but as a user, deciding which method to call is simple enough.
To evaluate at a point that you own and can consume, call
[`apply`](Self::apply). To evaluate at a point that you have only by reference
or can't consume, call [`apply_to_ref`](Self::apply_to_ref).
 */
pub trait Mapping {
    /// Type of elements in domain of mapping.
    type Dom: Eq + Clone;

    /// Type of elements in codomain of mapping.
    type Cod: Eq + Clone;

    /// Applies the mapping at a point possibly in the domain.
    fn apply(&self, x: Self::Dom) -> Option<Self::Cod>;

    /** Applies the mapping at a *reference* to a point possibly in the domain.

    The default implementation just calls [`apply`](Self::apply) after cloning.
    Mappings that own their data should give a more efficient implementation.
     */
    fn apply_to_ref(&self, x: &Self::Dom) -> Option<Self::Cod> {
        self.apply(x.clone())
    }

    /** Is the mapping defined at a point?

    The default implementation just checks whether
    [`apply_to_ref`](Self::apply_to_ref) returns something, but a more efficient
    implementation that avoids allocating should usually be given.
    */
    fn is_set(&self, x: &Self::Dom) -> bool {
        self.apply_to_ref(x).is_some()
    }
}

/** A mutable [mapping](Mapping).

Besides being mutable, such a mapping is also assumed to own its values (how
else could they be mutated?) and thus also allows access by reference.
 */
pub trait MutMapping: Mapping {
    /** Gets the value of the mapping at a point possibly in the domain.

    The same as [`apply`](Mapping::apply) but returns by reference rather than
    by value.
    */
    fn get(&self, x: &Self::Dom) -> Option<&Self::Cod>;

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
}

/** A [mapping](Mapping) with finite support.

While its domain and codomain can be infinite, such a mapping is defined at only
finitely many values in the domain. It is thus a "column of data", as found in
data tables and relational databases.
 */
pub trait Column: Mapping {
    /// Iterates over the column's pairs of elements.
    fn iter(&self) -> impl Iterator<Item = (Self::Dom, &Self::Cod)>;

    /// Iterates over the column's values.
    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.iter().map(|(_, y)| y)
    }

    /** Computes the preimage of the mapping at a value in the codomain.

    Depending on whether the implementation maintains a reverse index for the
    mapping, this method will take time linear in the size of the preimage or
    the size of the whole column.
    */
    fn preimage(&self, y: &Self::Cod) -> impl Iterator<Item = Self::Dom> {
        self.iter().filter(|&(_, z)| *z == *y).map(|(x, _)| x)
    }

    /// Is the mapping not defined anywhere?
    fn is_empty(&self) -> bool {
        self.iter().next().is_none()
    }
}

/** A [mutable mapping](MutMapping) with finite support.

Being a finite column that owns its data, a mutable column can be converted
to/from an iterator of pairs.
 */
pub trait MutColumn:
    MutMapping
    + Column
    + IntoIterator<Item = (Self::Dom, Self::Cod)>
    + FromIterator<(Self::Dom, Self::Cod)>
{
    /** Post-composes the column with another mapping.

    This is composition of partial functions. Note that the codomain element
    type must stay the same, which is the only thing that makes sense at this
    level of type specifity.
     */
    fn postcompose<F>(self, f: &F) -> Self
    where
        F: Mapping<Dom = Self::Cod, Cod = Self::Cod>,
    {
        self.into_iter().filter_map(|(x, y)| f.apply(y).map(|z| (x, z))).collect()
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
    pub fn iter_invalid(
        &self,
    ) -> impl Iterator<Item = InvalidFunction<Map::Dom>> + 'a + use<'a, Map, Dom, Cod> {
        let Function(mapping, dom, cod) = self;
        dom.iter().filter_map(|x| match mapping.apply_to_ref(&x) {
            Some(y) => {
                if cod.contains(&y) {
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
        validate::wrap_errors(self.iter_invalid())
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

/** Finds a retraction of the mapping, if it exists.

A retraction (left inverse) exists if and only if the mapping is injective. The
retraction is unique when it exists because it is defined only on the image of
the mapping. When the mapping is not injective, a pair of elements having the
same image is returned.
 */
pub fn retraction<Dom, Cod, InvMap>(
    mapping: &impl Column<Dom = Dom, Cod = Cod>,
) -> Result<InvMap, (Dom, Dom)>
where
    Dom: Clone,
    Cod: Clone,
    InvMap: MutMapping<Dom = Cod, Cod = Dom> + Default,
{
    let mut inv = InvMap::default();
    for (x, y) in mapping.iter() {
        if let Some(other_x) = inv.set(y.clone(), x.clone()) {
            return Err((x, other_x));
        }
    }
    Ok(inv)
}

/// An unindexed column backed by a vector.
#[derive(Clone, Debug, Derivative)]
#[derivative(Default(bound = ""))]
#[derivative(PartialEq(bound = "T: PartialEq"))]
#[derivative(Eq(bound = "T: Eq"))]
pub struct VecColumn<T>(Vec<Option<T>>);

/// Iterator over a [vector column](VecColumn).
pub struct VecColumnIter<T> {
    vec: Vec<Option<T>>,
    index: usize,
}

impl<T> VecColumn<T> {
    /// Creates a vector-backed column by consuming an existing vector.
    pub fn new(values: Vec<T>) -> Self {
        Self(values.into_iter().map(Some).collect())
    }
}

impl<T> Iterator for VecColumnIter<T> {
    type Item = (usize, T);

    fn next(&mut self) -> Option<Self::Item> {
        let n = self.vec.len();
        while self.index < n && self.vec[self.index].is_none() {
            self.index += 1;
        }
        if self.index < n {
            Some((self.index, self.vec[self.index].take().unwrap()))
        } else {
            None
        }
    }
}

impl<T> IntoIterator for VecColumn<T> {
    type Item = (usize, T);
    type IntoIter = VecColumnIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        VecColumnIter {
            vec: self.0,
            index: 0,
        }
    }
}

impl<T> FromIterator<(usize, T)> for VecColumn<T> {
    fn from_iter<Iter: IntoIterator<Item = (usize, T)>>(iter: Iter) -> Self {
        let mut vec = Vec::new();
        for (i, y) in iter {
            if i >= vec.len() {
                vec.resize_with(i + 1, Default::default);
            }
            vec[i] = Some(y);
        }
        VecColumn(vec)
    }
}

impl<T: Eq + Clone> Mapping for VecColumn<T> {
    type Dom = usize;
    type Cod = T;

    fn apply(&self, i: usize) -> Option<T> {
        self.0.get(i).cloned().flatten()
    }

    fn apply_to_ref(&self, i: &usize) -> Option<T> {
        self.apply(*i)
    }

    fn is_set(&self, i: &usize) -> bool {
        *i < self.0.len() && self.0[*i].is_some()
    }
}

impl<T: Eq + Clone> MutMapping for VecColumn<T> {
    fn get(&self, i: &usize) -> Option<&T> {
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
        self.0[i].replace(y)
    }

    fn unset(&mut self, i: &usize) -> Option<T> {
        if *i < self.0.len() {
            self.0[*i].take()
        } else {
            None
        }
    }
}

impl<T: Eq + Clone> Column for VecColumn<T> {
    fn iter(&self) -> impl Iterator<Item = (usize, &T)> {
        let filtered = self.0.iter().enumerate().filter(|(_, y)| y.is_some());
        filtered.map(|(i, y)| (i, y.as_ref().unwrap()))
    }

    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.0.iter().flatten()
    }

    fn is_empty(&self) -> bool {
        self.0.iter().all(|y| y.is_none())
    }
}

impl<T: Eq + Clone> MutColumn for VecColumn<T> {}

/// An unindexed column backed by an integer-valued vector.
pub type SkelColumn = VecColumn<usize>;

impl SkelColumn {
    /// Is the mapping a function between the finite sets `[m]` and `[n]`?
    pub fn is_function(&self, m: usize, n: usize) -> bool {
        let (dom, cod): (SkelFinSet, SkelFinSet) = (m.into(), n.into());
        Function(self, &dom, &cod).iter_invalid().next().is_none()
    }

    /// Is the mapping a partial injection, i.e., injective where it is defined?
    pub fn is_partial_injection(&self) -> bool {
        let result: Result<Self, _> = retraction(self);
        result.is_ok()
    }

    /// Is the mapping an injection between the finite sets `[m]` and `[n]`?
    pub fn is_injection(&self, m: usize, n: usize) -> bool {
        self.is_function(m, n) && self.is_partial_injection()
    }

    /// Is the mapping a permutation of the finite set `[n]`?
    pub fn is_permutation(&self, n: usize) -> bool {
        self.is_injection(n, n)
    }
}

/// An unindexed column backed by a hash map.
#[derive(Clone, Debug, Derivative, Constructor, From)]
#[derivative(PartialEq(bound = "K: Eq + Hash, V: PartialEq"))]
#[derivative(Eq(bound = "K: Eq + Hash, V: Eq"))]
#[derivative(Default(bound = ""))]
pub struct HashColumn<K, V>(HashMap<K, V>);

/// An unindexed column with keys of type `Ustr`.
pub type UstrColumn<V> = HashColumn<Ustr, V>;

impl<K, V> IntoIterator for HashColumn<K, V> {
    type Item = (K, V);
    type IntoIter = std::collections::hash_map::IntoIter<K, V>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<K, V> FromIterator<(K, V)> for HashColumn<K, V>
where
    K: Eq + Hash,
{
    fn from_iter<Iter: IntoIterator<Item = (K, V)>>(iter: Iter) -> Self {
        HashColumn(HashMap::from_iter(iter))
    }
}

impl<K, V> Mapping for HashColumn<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Clone,
{
    type Dom = K;
    type Cod = V;

    fn apply(&self, x: K) -> Option<V> {
        self.apply_to_ref(&x)
    }
    fn apply_to_ref(&self, x: &K) -> Option<V> {
        self.0.get(x).cloned()
    }
    fn is_set(&self, x: &K) -> bool {
        self.0.contains_key(x)
    }
}

impl<K, V> MutMapping for HashColumn<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Clone,
{
    fn get(&self, x: &K) -> Option<&V> {
        self.0.get(x)
    }
    fn set(&mut self, x: K, y: V) -> Option<V> {
        self.0.insert(x, y)
    }
    fn unset(&mut self, x: &K) -> Option<V> {
        self.0.remove(x)
    }
}

impl<K, V> Column for HashColumn<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Clone,
{
    fn iter(&self) -> impl Iterator<Item = (K, &V)> {
        self.0.iter().map(|(k, v)| (k.clone(), v))
    }

    fn values(&self) -> impl Iterator<Item = &Self::Cod> {
        self.0.values()
    }

    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<K, V> MutColumn for HashColumn<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Clone,
{
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

/// An index implemented as a vector of vectors.
#[derive(Clone, Debug, Derivative)]
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

/// An index implemented by a hash map into vectors.
#[derive(Clone, Debug, Derivative)]
#[derivative(Default(bound = ""))]
struct HashIndex<X, Y>(HashMap<Y, Vec<X>>);

impl<X, Y> Index for HashIndex<X, Y>
where
    X: Eq + Clone,
    Y: Eq + Hash + Clone,
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
#[derive(Clone, Derivative, Debug)]
#[derivative(PartialEq, Eq)]
struct IndexedColumn<Dom, Cod, Col, Ind> {
    mapping: Col,
    #[derivative(PartialEq = "ignore")]
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

impl<Dom, Cod, Col, Ind> IntoIterator for IndexedColumn<Dom, Cod, Col, Ind>
where
    Col: IntoIterator<Item = (Dom, Cod)>,
{
    type Item = (Dom, Cod);
    type IntoIter = Col::IntoIter;

    fn into_iter(self) -> Self::IntoIter {
        self.mapping.into_iter()
    }
}

impl<Dom, Cod, Col, Ind> FromIterator<(Dom, Cod)> for IndexedColumn<Dom, Cod, Col, Ind>
where
    Dom: Eq + Clone,
    Cod: Eq + Clone,
    Col: Default + MutMapping<Dom = Dom, Cod = Cod>,
    Ind: Default + Index<Dom = Dom, Cod = Cod>,
{
    fn from_iter<Iter: IntoIterator<Item = (Dom, Cod)>>(iter: Iter) -> Self {
        let mut col: Self = Default::default();
        for (x, y) in iter {
            col.set(x, y);
        }
        col
    }
}

impl<Dom, Cod, Col, Ind> Mapping for IndexedColumn<Dom, Cod, Col, Ind>
where
    Dom: Eq + Clone,
    Cod: Eq + Clone,
    Col: Mapping<Dom = Dom, Cod = Cod>,
{
    type Dom = Dom;
    type Cod = Cod;

    fn apply(&self, x: Dom) -> Option<Cod> {
        self.mapping.apply(x)
    }
    fn apply_to_ref(&self, x: &Dom) -> Option<Cod> {
        self.mapping.apply_to_ref(x)
    }
    fn is_set(&self, x: &Dom) -> bool {
        self.mapping.is_set(x)
    }
}

impl<Dom, Cod, Col, Ind> MutMapping for IndexedColumn<Dom, Cod, Col, Ind>
where
    Dom: Eq + Clone,
    Cod: Eq + Clone,
    Col: MutMapping<Dom = Dom, Cod = Cod>,
    Ind: Index<Dom = Dom, Cod = Cod>,
{
    fn get(&self, x: &Dom) -> Option<&Cod> {
        self.mapping.get(x)
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
    Cod: Eq + Clone,
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
    fn is_empty(&self) -> bool {
        self.mapping.is_empty()
    }
}

/** An indexed column backed by an integer-valued vector.

The column has the natural numbers (`usize`) as both its domain and codomain,
making it suitable for use with skeletal finite sets.
*/
#[derive(Clone, Debug, Derivative, PartialEq, Eq, Default)]
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

impl IntoIterator for SkelIndexedColumn {
    type Item = (usize, usize);
    type IntoIter = VecColumnIter<usize>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl FromIterator<(usize, usize)> for SkelIndexedColumn {
    fn from_iter<Iter: IntoIterator<Item = (usize, usize)>>(iter: Iter) -> Self {
        Self(IndexedColumn::from_iter(iter))
    }
}

impl Mapping for SkelIndexedColumn {
    type Dom = usize;
    type Cod = usize;

    fn apply(&self, x: usize) -> Option<usize> {
        self.0.apply(x)
    }
    fn apply_to_ref(&self, x: &usize) -> Option<usize> {
        self.0.apply(*x)
    }
    fn is_set(&self, x: &usize) -> bool {
        self.0.is_set(x)
    }
}

impl MutMapping for SkelIndexedColumn {
    fn get(&self, x: &usize) -> Option<&usize> {
        self.0.get(x)
    }
    fn set(&mut self, x: usize, y: usize) -> Option<usize> {
        self.0.set(x, y)
    }
    fn unset(&mut self, x: &usize) -> Option<usize> {
        self.0.unset(x)
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
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl MutColumn for SkelIndexedColumn {}

/** An indexed column backed by a vector.

The domain of the column is the natural numbers (`usize`). Since the codomain is
an arbitrary type (`T`), the index is implemented using a hash map.
*/
#[derive(Clone, Debug, Derivative, PartialEq, Eq)]
#[derivative(Default(bound = ""))]
pub struct IndexedVecColumn<T>(IndexedColumn<usize, T, VecColumn<T>, HashIndex<usize, T>>);

impl<T: Eq + Hash + Clone> IndexedVecColumn<T> {
    /// Creates a new vector-backed column from an existing vector.
    pub fn new(values: &[T]) -> Self {
        values.iter().cloned().enumerate().collect()
    }
}

impl<T> IntoIterator for IndexedVecColumn<T> {
    type Item = (usize, T);
    type IntoIter = VecColumnIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<T: Eq + Hash + Clone> FromIterator<(usize, T)> for IndexedVecColumn<T> {
    fn from_iter<Iter: IntoIterator<Item = (usize, T)>>(iter: Iter) -> Self {
        Self(IndexedColumn::from_iter(iter))
    }
}

impl<T: Eq + Hash + Clone> Mapping for IndexedVecColumn<T> {
    type Dom = usize;
    type Cod = T;

    fn apply(&self, x: usize) -> Option<T> {
        self.0.apply(x)
    }
    fn apply_to_ref(&self, x: &usize) -> Option<T> {
        self.0.apply(*x)
    }
    fn is_set(&self, x: &usize) -> bool {
        self.0.is_set(x)
    }
}

impl<T: Eq + Hash + Clone> MutMapping for IndexedVecColumn<T> {
    fn get(&self, x: &usize) -> Option<&T> {
        self.0.get(x)
    }
    fn set(&mut self, x: usize, y: T) -> Option<T> {
        self.0.set(x, y)
    }
    fn unset(&mut self, x: &usize) -> Option<T> {
        self.0.unset(x)
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
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<T: Eq + Hash + Clone> MutColumn for IndexedVecColumn<T> {}

/// An indexed column backed by hash maps.
#[derive(Clone, Derivative, Debug)]
#[derivative(Default(bound = ""))]
#[derivative(PartialEq(bound = "K: Eq + Hash, V: PartialEq"))]
#[derivative(Eq(bound = "K: Eq + Hash, V: Eq"))]
#[allow(clippy::type_complexity)]
pub struct IndexedHashColumn<K, V>(IndexedColumn<K, V, HashColumn<K, V>, HashIndex<K, V>>);

/// An indexed column with keys and values of type `Ustr`.
#[allow(clippy::type_complexity)]
pub type IndexedUstrColumn = IndexedHashColumn<Ustr, Ustr>;

impl<K, V> IntoIterator for IndexedHashColumn<K, V>
where
    K: Eq + Hash,
    V: Eq + Hash,
{
    type Item = (K, V);
    type IntoIter = <HashColumn<K, V> as IntoIterator>::IntoIter;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<K, V> FromIterator<(K, V)> for IndexedHashColumn<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Hash + Clone,
{
    fn from_iter<Iter: IntoIterator<Item = (K, V)>>(iter: Iter) -> Self {
        Self(IndexedColumn::from_iter(iter))
    }
}

impl<K, V> Mapping for IndexedHashColumn<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Hash + Clone,
{
    type Dom = K;
    type Cod = V;

    fn apply(&self, x: K) -> Option<V> {
        self.0.apply(x)
    }
    fn apply_to_ref(&self, x: &K) -> Option<V> {
        self.0.apply_to_ref(x)
    }
    fn is_set(&self, x: &K) -> bool {
        self.0.is_set(x)
    }
}

impl<K, V> MutMapping for IndexedHashColumn<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Hash + Clone,
{
    fn get(&self, x: &K) -> Option<&V> {
        self.0.get(x)
    }
    fn set(&mut self, x: K, y: V) -> Option<V> {
        self.0.set(x, y)
    }
    fn unset(&mut self, x: &K) -> Option<V> {
        self.0.unset(x)
    }
}

impl<K, V> Column for IndexedHashColumn<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Hash + Clone,
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
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<K, V> MutColumn for IndexedHashColumn<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Hash + Clone,
{
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vec_column() {
        let mut col = VecColumn::new(vec!["foo", "bar", "baz"]);
        assert!(!col.is_empty());
        assert!(col.is_set(&2));
        assert_eq!(col.apply(2), Some("baz"));
        assert_eq!(col.apply(3), None);
        assert_eq!(col.apply_to_ref(&2), Some("baz"));
        assert_eq!(col.get(&2), Some(&"baz"));
        assert_eq!(col.update(2, None), Some("baz"));
        assert!(!col.is_set(&2));

        col.set(5, "baz");
        col.set(3, "bar");
        let preimage: Vec<_> = col.preimage(&"bar").collect();
        assert_eq!(preimage, vec![1, 3]);

        let data: Vec<_> = col.clone().into_iter().collect();
        assert_eq!(data, vec![(0, "foo"), (1, "bar"), (3, "bar"), (5, "baz")]);
        let new_col: VecColumn<_> = data.into_iter().collect();
        assert_eq!(new_col, col);
    }

    #[test]
    fn hash_column() {
        let mut col: HashColumn<char, &str> = Default::default();
        assert!(col.is_empty());
        col.set('a', "foo");
        col.set('b', "bar");
        col.set('c', "baz");
        assert!(!col.is_empty());
        assert_eq!(col.apply('c'), Some("baz"));
        assert_eq!(col.apply_to_ref(&'c'), Some("baz"));
        assert_eq!(col.get(&'c'), Some(&"baz"));
        assert_eq!(col.unset(&'c'), Some("baz"));
        assert!(!col.is_set(&'c'));
        col.set('c', "bar");

        let mut preimage: Vec<_> = col.preimage(&"bar").collect();
        preimage.sort();
        assert_eq!(preimage, vec!['b', 'c']);

        let mut data: Vec<_> = col.clone().into_iter().collect();
        data.sort();
        assert_eq!(data, vec![('a', "foo"), ('b', "bar"), ('c', "bar")]);
        let new_col: HashColumn<_, _> = data.into_iter().collect();
        assert_eq!(new_col, col);
    }

    #[test]
    fn skel_function_properties() {
        let map = SkelColumn::new(vec![1, 3, 5]);
        assert!(!map.is_function(3, 5));
        assert!(map.is_injection(3, 6));
        let map = SkelColumn::new(vec![0, 1, 0]);
        assert!(map.is_function(3, 2));
        assert!(!map.is_injection(3, 2));
        let map = SkelColumn::new(vec![3, 1, 2, 0]);
        assert!(map.is_permutation(4));
    }

    #[test]
    fn skel_indexed_column() {
        let mut col = SkelIndexedColumn::new(&[1, 3, 5]);
        assert!(!col.is_empty());
        assert!(col.is_set(&2));
        assert_eq!(col.apply(2), Some(5));
        assert_eq!(col.apply_to_ref(&2), Some(5));
        assert_eq!(col.get(&2), Some(&5));
        let preimage: Vec<_> = col.preimage(&5).collect();
        assert_eq!(preimage, vec![2]);

        assert_eq!(col.set(0, 5), Some(1));
        assert_eq!(col.preimage(&1).count(), 0);
        let mut preimage: Vec<_> = col.preimage(&5).collect();
        preimage.sort();
        assert_eq!(preimage, vec![0, 2]);

        let new_col: SkelIndexedColumn = col.clone().into_iter().collect();
        assert_eq!(new_col, col);
    }

    #[test]
    fn indexed_vec_column() {
        let mut col = IndexedVecColumn::new(&["foo", "bar", "baz"]);
        assert!(!col.is_empty());
        assert!(col.is_set(&2));
        assert_eq!(col.apply(2), Some("baz"));
        let preimage: Vec<_> = col.preimage(&"baz").collect();
        assert_eq!(preimage, vec![2]);

        assert_eq!(col.set(0, "baz"), Some("foo"));
        assert_eq!(col.preimage(&"foo").count(), 0);
        let mut preimage: Vec<_> = col.preimage(&"baz").collect();
        preimage.sort();
        assert_eq!(preimage, vec![0, 2]);

        let new_col: IndexedVecColumn<_> = col.clone().into_iter().collect();
        assert_eq!(new_col, col);
    }

    #[test]
    fn indexed_hash_column() {
        let mut col: IndexedHashColumn<char, &str> = Default::default();
        assert!(col.is_empty());
        col.set('a', "foo");
        col.set('b', "bar");
        col.set('c', "baz");
        assert!(!col.is_empty());
        assert_eq!(col.apply('c'), Some("baz"));
        let preimage: Vec<_> = col.preimage(&"baz").collect();
        assert_eq!(preimage, vec!['c']);

        assert_eq!(col.set('a', "baz"), Some("foo"));
        assert_eq!(col.preimage(&"foo").count(), 0);
        let mut preimage: Vec<_> = col.preimage(&"baz").collect();
        preimage.sort();
        assert_eq!(preimage, vec!['a', 'c']);

        let new_col: IndexedHashColumn<_, _> = col.clone().into_iter().collect();
        assert_eq!(new_col, col);
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
