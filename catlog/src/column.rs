use std::hash::Hash;
use std::collections::hash_map::HashMap;

/** A functional mapping.

A mapping takes values of type [`Dom`](Self::Dom) to values of type
[`Cod`](Self::Cod). Unlike a function, a mapping need not be defined on its
whole domain. A mapping is thus more like a partial function, but it does not
actually know its domain of definition. If needed, that information should be
provided separately, say as a [`Set`](crate::set::Set).

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

/** An unindexed column backed by a vector.
 */
#[derive(Clone,Default)]
pub struct VecColumn<T>(Vec<Option<T>>);

impl<T> VecColumn<T> {
    pub fn new(values: Vec<T>) -> Self {
        Self { 0: values.into_iter().map(Some).collect() }
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
            self.0.resize_with(i+1, Default::default);
        }
        std::mem::replace(&mut self.0[i], Some(y))
    }

    fn unset(&mut self, i: &usize) -> Option<T> {
        std::mem::replace(&mut self.0[*i], None)
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
#[derive(Clone,Default)]
pub struct HashColumn<K,V>(HashMap<K,V>);

impl<K: Eq+Hash, V> HashColumn<K,V> {
    pub fn new(hash_map: HashMap<K,V>) -> Self {
        Self { 0: hash_map }
    }
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

/** An index implemented by a hash map.

Indices are currently not an official interface, just a convenience for
implementing columns.
 */
#[derive(Clone)]
struct HashIndex<X,Y>(HashMap<Y,Vec<X>>);

impl<X: Eq + Clone, Y: Eq + Hash + Clone> HashIndex<X,Y> {
    pub fn new() -> Self {
        Self { 0: HashMap::<Y,Vec<X>>::new() }
    }

    pub fn preimage(&self, y: &Y) -> std::iter::Cloned<std::slice::Iter<'_,X>> {
        let iter = match self.0.get(y) {
            Some(ref vec) => vec.iter(),
            None => ([] as [X; 0]).iter(),
        };
        iter.cloned()
    }

    pub fn insert(&mut self, x: X, y: &Y) {
        match self.0.get_mut(y) {
            Some(vec) => { vec.push(x); }
            None => { self.0.insert(y.clone(), vec![x]); }
        }
    }

    pub fn remove(&mut self, x: &X, y: &Y) {
        let vec = self.0.get_mut(y).unwrap();
        let i = vec.iter().rposition(|w| *w == *x).unwrap();
        vec.remove(i);
    }
}

/** An indexed column backed by a vector, with hash map as index.
 */
#[derive(Clone)]
pub struct IndexedVecColumn<T> {
    mapping: VecColumn<T>,
    index: HashIndex<usize,T>
}

impl<T: Eq + Hash + Clone> IndexedVecColumn<T> {
    pub fn new(values: Vec<T>) -> Self {
        let mut index = HashIndex::<usize,T>::new();
        for (x, y) in values.iter().enumerate() {
            index.insert(x, y);
        }
        Self { mapping: VecColumn::new(values), index: index }
    }
}

impl<T: Eq + Hash + Clone> Mapping for IndexedVecColumn<T> {
    type Dom = usize;
    type Cod = T;

    fn apply(&self, x: &usize) -> Option<&T> { self.mapping.apply(x) }
    fn is_set(&self, x: &usize) -> bool { self.mapping.is_set(x) }

    fn set(&mut self, x: usize, y: T) -> Option<T> {
        let old = self.unset(&x);
        self.index.insert(x, &y);
        self.mapping.set(x, y);
        old
    }

    fn unset(&mut self, x: &usize) -> Option<T> {
        let old = self.mapping.unset(x);
        if let Some(ref y) = old {
            self.index.remove(&x, y);
        }
        old
    }
}

impl <T: Eq + Hash + Clone> Column for IndexedVecColumn<T> {
    fn iter(&self) -> impl Iterator<Item = (usize, &T)> {
        self.mapping.iter()
    }
    fn preimage(&self, y: &T) -> impl Iterator<Item = usize> {
        self.index.preimage(y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let mut col: HashColumn<i32, &str> = Default::default();
        col.set(3, "foo");
        col.set(5, "bar");
        col.set(7, "baz");
        assert_eq!(col.apply(&7), Some(&"baz"));
        assert_eq!(col.unset(&7), Some("baz"));
        assert!(!col.is_set(&7));
        col.set(7, "bar");

        let mut preimage: Vec<_> = col.preimage(&"bar").collect();
        preimage.sort();
        assert_eq!(preimage, vec![5,7]);
    }

    #[test]
    fn indexed_vec_column() {
        let mut col = IndexedVecColumn::new(vec!["foo", "bar", "baz"]);
        assert!(col.is_set(&2));
        assert_eq!(col.apply(&2), Some(&"baz"));
        let preimage: Vec<_> = col.preimage(&"baz").collect();
        assert_eq!(preimage, vec![2]);

        assert_eq!(col.set(0, "baz"), Some("foo"));
        let mut preimage: Vec<_> = col.preimage(&"baz").collect();
        preimage.sort();
        assert_eq!(preimage, vec![0,2]);
    }
}
