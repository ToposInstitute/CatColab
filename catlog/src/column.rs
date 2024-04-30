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

    /// Sets the mapping at a point.
    fn set(&mut self, x: Self::Dom, y: Self::Cod);

    /// Un-sets the mapping at a point, making it undefined at that point.
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

    fn set(&mut self, i: usize, y: T) {
        if i >= self.0.len() {
            self.0.resize_with(i+1, Default::default);
        }
        self.0[i] = Some(y);
    }

    fn unset(&mut self, i: &usize) -> Option<T> {
        std::mem::replace(&mut self.0[*i], None)
    }

    fn is_set(&self, i: &usize) -> bool {
        return *i < self.0.len();
    }
}

impl <T: Eq> Column for VecColumn<T> {
    fn iter(&self) -> impl Iterator<Item = (usize, &T)> {
        let filtered = self.0.iter().enumerate().filter(|(_, y)| y.is_some());
        filtered.map(|(i, y)| (i, y.as_ref().unwrap()))
    }
}

/*
/** An indexed mapping backed by a vector (and a hash map).
 */
#[derive(Clone)]
pub struct IndexedVecMapping<T> {
    mapping: Vec<T>,
    index: HashMap<T,Vec<usize>>,
}

impl<T: Eq + Hash + Clone> IndexedVecMapping<T> {
    pub fn new(mapping: Vec<T>) -> Self {
        let mut index: HashMap<T,Vec<usize>> = HashMap::new();
        for (x, y) in mapping.iter().enumerate() {
            insert_into_index(&mut index, x, y);
        }
        Self { mapping, index }
    }
}

fn insert_into_index<X,Y>(index: &mut HashMap<Y,Vec<X>>,
                          x: X, y: &Y) where Y: Eq + Hash + Clone {
    match index.get_mut(y) {
        Some(vec) => { vec.push(x); }
        None => { index.insert(y.clone(), vec![x]); }
    }
}

impl<T: Eq + Hash> Mapping for IndexedVecMapping<T> {
    type Dom = usize;
    type Cod = T;

    fn apply(&self, x: &usize) -> Option<&T> {
        self.mapping.get(*x)
    }

    fn is_set(&self, x: &usize) -> bool {
        *x < self.mapping.len()
    }

    fn preimage(&self, y: &T) -> impl Iterator<Item = usize> {
        let iter = match self.index.get(y) {
            Some(vec) => vec.iter(),
            None => ([] as [usize; 0]).iter(),
        };
        iter.cloned()
    }
}
*/

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
}
