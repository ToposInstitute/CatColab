//! Data structures for mappings and columns, as found in data tables.

use std::hash::Hash;
use std::collections::hash_map::HashMap;
use derive_more::From;
use nonempty::NonEmpty;
use thiserror::Error;

use crate::validate;
use super::set::{Set, FinSet};

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

    /// Is the mapping defined at a value?
    fn is_set(&self, x: &Self::Dom) -> bool {
        self.apply(x).is_some()
    }

    /// Validates that the mapping restricts to a function on a finite domain.
    fn validate_is_function<Dom, Cod>(
        &self,
        dom: &Dom,
        cod: &Cod
    ) -> Result<(), NonEmpty<InvalidFunction<Self::Dom>>>
    where Dom: FinSet<Elem = Self::Dom>, Cod: Set<Elem = Self::Cod> {
        validate::collect_errors(self.iter_invalid_function(dom, cod))
    }

    /// Iterates over failures of the mapping to restrict to a function.
    fn iter_invalid_function<Dom, Cod>(
        &self,
        dom: &Dom,
        cod: &Cod
    ) -> impl Iterator<Item = InvalidFunction<Self::Dom>>
    where Dom: FinSet<Elem = Self::Dom>, Cod: Set<Elem = Self::Cod> {
        dom.iter().filter_map(|x| {
            match self.apply(&x) {
                Some(y) => if cod.contains(&y) {
                    None
                } else {
                    Some(InvalidFunction::Cod(x))
                }
                None => Some(InvalidFunction::Dom(x))
            }
        })
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

    /** Computes the preimage of the mapping at a value in the codomain.

    Depending on whether the implementation maintains a reverse index for the
    mapping, this method can be cheap or expensive.
    */
    fn preimage(&self, y: &Self::Cod) -> impl Iterator<Item = Self::Dom> {
        self.iter().filter(|&(_, z)| *z == *y).map(|(x,_)| x)
    }
}

/// A failure of a mapping to restrict to a function between two sets.
#[derive(Debug,Error,PartialEq,Eq)]
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
        match self { InvalidFunction::Dom(x) | InvalidFunction::Cod(x) => x }
    }
}

/** An unindexed column backed by a vector.
 */
#[derive(Clone)]
pub struct VecColumn<T>(Vec<Option<T>>);

impl<T> VecColumn<T> {
    /// Creates a vector-backed column by consuming an existing vector.
    pub fn new(values: Vec<T>) -> Self {
        Self { 0: values.into_iter().map(Some).collect() }
    }
}

impl<T> Default for VecColumn<T> {
    fn default() -> Self { Self { 0: Default::default() } }
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
            self.0.resize_with(i+1, Default::default);
        }
        std::mem::replace(&mut self.0[i], Some(y))
    }

    fn unset(&mut self, i: &usize) -> Option<T> {
        if *i < self.0.len() {
            std::mem::replace(&mut self.0[*i], None)
        } else {
            None
        }
    }

    fn is_set(&self, i: &usize) -> bool {
        return *i < self.0.len();
    }
}

impl<T: Eq> Column for VecColumn<T> {
    fn iter(&self) -> impl Iterator<Item = (usize, &T)> {
        let filtered = self.0.iter().enumerate().filter(|(_, y)| y.is_some());
        filtered.map(|(i, y)| (i, y.as_ref().unwrap()))
    }
}

/** An unindexed column backed by a hash map.
 */
#[derive(Clone,From)]
pub struct HashColumn<K,V>(HashMap<K,V>);

impl<K: Eq+Hash, V: Eq> Default for HashColumn<K,V> {
    fn default() -> Self { Self::from(HashMap::<K,V>::new()) }
}

impl<K: Eq+Hash, V: Eq> Mapping for HashColumn<K,V> {
    type Dom = K;
    type Cod = V;

    fn apply(&self, x: &K) -> Option<&V> { self.0.get(x) }
    fn set(&mut self, x: K, y: V) -> Option<V> { self.0.insert(x, y) }
    fn unset(&mut self, x: &K) -> Option<V> { self.0.remove(x) }
    fn is_set(&self, x: &K) -> bool { self.0.contains_key(x) }
}

impl<K: Eq+Hash+Clone, V: Eq> Column for HashColumn<K,V> {
    fn iter(&self) -> impl Iterator<Item = (K,&V)> {
        self.0.iter().map(|(k,v)| (k.clone(), v))
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
#[derive(Clone)]
struct VecIndex<T>(Vec<Vec<T>>);

impl<T> Default for VecIndex<T> {
    fn default() -> Self { Self { 0: Default::default() } }
}

impl<T: Eq + Clone> Index for VecIndex<T> {
    type Dom = T;
    type Cod = usize;

    fn preimage(&self, y: &usize) -> impl Iterator<Item = T> {
        let iter = match self.0.get(*y) {
            Some(ref vec) => vec.iter(),
            None => ([] as [T; 0]).iter(),
        };
        iter.cloned()
    }

    fn insert(&mut self, x: T, y: &usize) {
        let i = *y;
        if i >= self.0.len() {
            self.0.resize_with(i+1, Default::default);
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
#[derive(Clone)]
struct HashIndex<X,Y>(HashMap<Y,Vec<X>>);

impl<X, Y: Eq + Hash> Default for HashIndex<X,Y> {
    fn default() -> Self { Self { 0: HashMap::<Y,Vec<X>>::new() } }
}

impl<X: Eq + Clone, Y: Eq + Hash + Clone> Index for HashIndex<X,Y> {
    type Dom = X;
    type Cod = Y;

    fn preimage(&self, y: &Y) -> impl Iterator<Item = X> {
        let iter = match self.0.get(y) {
            Some(ref vec) => vec.iter(),
            None => ([] as [X; 0]).iter(),
        };
        iter.cloned()
    }

    fn insert(&mut self, x: X, y: &Y) {
        match self.0.get_mut(y) {
            Some(vec) => { vec.push(x); }
            None => { self.0.insert(y.clone(), vec![x]); }
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
struct IndexedColumn<Dom,Cod,Col,Ind>
where Col: Column<Dom=Dom, Cod=Cod>, Ind: Index<Dom=Dom, Cod=Cod> {
    mapping: Col,
    index: Ind,
}

impl <Dom,Cod,Col,Ind> Default for IndexedColumn<Dom,Cod,Col,Ind>
where Col: Column<Dom=Dom, Cod=Cod> + Default,
      Ind: Index<Dom=Dom, Cod=Cod> + Default {
    fn default() -> Self {
        Self { mapping: Default::default(), index: Default::default() }
    }
}

impl<Dom,Cod,Col,Ind> Mapping for IndexedColumn<Dom,Cod,Col,Ind>
where Dom: Eq + Clone, Cod: Eq,
      Col: Column<Dom=Dom, Cod=Cod>, Ind: Index<Dom=Dom, Cod=Cod> {
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
            self.index.remove(&x, y);
        }
        old
    }
}

impl<Dom,Cod,Col,Ind> Column for IndexedColumn<Dom,Cod,Col,Ind>
where Dom: Eq + Clone, Cod: Eq,
      Col: Column<Dom=Dom, Cod=Cod>, Ind: Index<Dom=Dom, Cod=Cod> {
    fn iter(&self) -> impl Iterator<Item = (Dom, &Cod)> {
        self.mapping.iter()
    }

    fn preimage(&self, y: &Cod) -> impl Iterator<Item = Dom> {
        self.index.preimage(y)
    }
}

/** An indexed column backed by an integer-valued vector.

The column has the natural numbers (`usize`) as both its domain and codomain,
making it suitable for use with skeletal finite sets.
*/
#[derive(Clone)]
pub struct SkelIndexedColumn(
    IndexedColumn<usize, usize, VecColumn<usize>, VecIndex<usize>>
);

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

impl Default for SkelIndexedColumn {
    fn default() -> Self { Self {0: Default::default() } }
}

impl Mapping for SkelIndexedColumn {
    type Dom = usize;
    type Cod = usize;
    fn apply(&self, x: &usize) -> Option<&usize> { self.0.apply(x) }
    fn set(&mut self, x: usize, y: usize) -> Option<usize> { self.0.set(x,y) }
    fn unset(&mut self, x: &usize) -> Option<usize> { self.0.unset(x) }
    fn is_set(&self, x: &usize) -> bool { self.0.is_set(x) }
}

impl Column for SkelIndexedColumn {
    fn iter(&self) -> impl Iterator<Item=(usize,&usize)> { self.0.iter() }
    fn preimage(&self, y: &usize) -> impl Iterator<Item=usize> { self.0.preimage(y) }
}

/** An indexed column backed by a vector.

The domain of the column is the natural numbers (`usize`). Since the codomain is
an arbitrary type (`T`), the index is implemented using a hash map.
*/
#[derive(Clone)]
pub struct IndexedVecColumn<T: Eq+Hash+Clone>(
    IndexedColumn<usize, T, VecColumn<T>, HashIndex<usize,T>>
);

impl<T: Eq+Hash+Clone> IndexedVecColumn<T> {
    /// Creates a new vector-backed column from an existing vector.
    pub fn new(values: &[T]) -> Self {
        let mut col: Self = Default::default();
        for (x, y) in values.iter().cloned().enumerate() {
            col.set(x, y);
        }
        col
    }
}

impl<T: Eq+Hash+Clone> Default for IndexedVecColumn<T> {
    fn default() -> Self { Self { 0: Default::default() } }
}

impl<T: Eq+Hash+Clone> Mapping for IndexedVecColumn<T> {
    type Dom = usize;
    type Cod = T;
    fn apply(&self, x: &usize) -> Option<&T> { self.0.apply(x) }
    fn set(&mut self, x: usize, y: T) -> Option<T> { self.0.set(x,y) }
    fn unset(&mut self, x: &usize) -> Option<T> { self.0.unset(x) }
    fn is_set(&self, x: &usize) -> bool { self.0.is_set(x) }
}

impl<T: Eq+Hash+Clone> Column for IndexedVecColumn<T> {
    fn iter(&self) -> impl Iterator<Item=(usize,&T)> { self.0.iter() }
    fn preimage(&self, y: &T) -> impl Iterator<Item=usize> { self.0.preimage(y) }
}

/// An indexed column backed by hash maps.
#[derive(Clone)]
pub struct IndexedHashColumn<K: Eq+Hash+Clone, V: Eq+Hash+Clone>(
    IndexedColumn<K, V, HashColumn<K,V>, HashIndex<K,V>>
);

impl<K,V> Default for IndexedHashColumn<K,V>
where K: Eq+Hash+Clone, V: Eq+Hash+Clone {
    fn default() -> Self { Self { 0: Default::default() } }
}

impl<K,V> Mapping for IndexedHashColumn<K,V>
where K: Eq+Hash+Clone, V: Eq+Hash+Clone {
    type Dom = K;
    type Cod = V;
    fn apply(&self, x: &K) -> Option<&V> { self.0.apply(x) }
    fn set(&mut self, x: K, y: V) -> Option<V> { self.0.set(x,y) }
    fn unset(&mut self, x: &K) -> Option<V> { self.0.unset(x) }
    fn is_set(&self, x: &K) -> bool { self.0.is_set(x) }
}

impl<K,V> Column for IndexedHashColumn<K,V>
where K: Eq+Hash+Clone, V: Eq+Hash+Clone {
    fn iter(&self) -> impl Iterator<Item=(K,&V)> { self.0.iter() }
    fn preimage(&self, y: &V) -> impl Iterator<Item=K> { self.0.preimage(y) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::set::SkelFinSet;

    #[test]
    fn vec_column() {
        let mut col = VecColumn::new(vec!["foo", "bar", "baz"]);
        assert!(col.is_set(&2));
        assert_eq!(col.apply(&2), Some(&"baz"));
        assert!(!col.is_set(&3));
        assert_eq!(col.apply(&3), None);

        col.set(4, "baz");
        col.set(3, "bar");
        let preimage: Vec<_> = col.preimage(&"bar").collect();
        assert_eq!(preimage, vec![1,3]);
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
        assert_eq!(preimage, vec!['b','c']);
    }

    #[test]
    fn skel_indexed_column() {
        let mut col = SkelIndexedColumn::new(&[1,3,5]);
        assert!(col.is_set(&2));
        assert_eq!(col.apply(&2), Some(&5));
        let preimage: Vec<_> = col.preimage(&5).collect();
        assert_eq!(preimage, vec![2]);

        assert_eq!(col.set(0, 5), Some(1));
        assert_eq!(col.preimage(&1).count(), 0);
        let mut preimage: Vec<_> = col.preimage(&5).collect();
        preimage.sort();
        assert_eq!(preimage, vec![0,2]);
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
        assert_eq!(preimage, vec![0,2]);
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
        assert_eq!(preimage, vec!['a','c']);
    }

    #[test]
    fn validate_column() {
        let col = VecColumn::new(vec![1, 2, 4]);
        let validate = |m, n|
          col.validate_is_function(&SkelFinSet::from(m), &SkelFinSet::from(n));
        assert!(validate(3, 5).is_ok());
        assert_eq!(validate(4, 5).unwrap_err(),
                   NonEmpty::new(InvalidFunction::Dom::<usize>(3)));
        assert_eq!(validate(3, 4).unwrap_err(),
                   NonEmpty::new(InvalidFunction::Cod::<usize>(2)));
    }
}
