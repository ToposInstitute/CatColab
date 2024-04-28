use std::hash::Hash;
use std::collections::hash_map::HashMap;

/** A functional mapping.

A mapping takes values of type [`Dom`](Self::Dom) to values of type
[`Cod`](Self::Cod). Unlike a function, a mapping need not be defined on its
whole domain. A mapping is thus more like a partial function, but it does not
actually know its domain of definition. That information, if needed, can be
stored separately as a [`Set`](crate::set::Set).

Neither the domain nor the codomain are assumed to be finite. However, it is
assumed that the mapping has finite fibers, so that the
[`preimage`](Self::preimage) method makes sense.
 */
pub trait Mapping {
    /// Type of elements in domain of mapping.
    type Dom: Eq;

    /// Type of elements in codomain of mapping.
    type Cod: Eq;

    /// Applies the mapping at a value possibly in the domain.
    fn apply(&self, x: &Self::Dom) -> Option<&Self::Cod>;

    /** Computes the preimage of the mapping at a value in the codomain.

    Depending on whether the implementation maintains a reverse index for the
    mapping, this method can be cheap or expensive.
    */
    fn preimage(&self, y: &Self::Cod) -> impl Iterator<Item = Self::Dom>;

    /// Is the mapping defined at a value?
    fn is_defined(&self, x: &Self::Dom) -> bool {
        self.apply(x).is_some()
    }
}

/** An unindexed mapping backed by a vector.
 */
#[derive(Clone)]
pub struct VecMapping<T>(Vec<T>);

impl<T: Eq> Mapping for VecMapping<T> {
    type Dom = usize;
    type Cod = T;

    fn apply(&self, x: &usize) -> Option<&T> {
        self.0.get(*x)
    }

    fn is_defined(&self, x: &usize) -> bool {
        return *x < self.0.len();
    }

    fn preimage(&self, y: &T) -> impl Iterator<Item = usize> {
        let iter = self.0.iter();
        iter.enumerate().filter(|&(_, z)| *z == *y).map(|(i,_)| i)
    }
}

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

    fn is_defined(&self, x: &usize) -> bool {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vec_mapping() {
        let mapping = VecMapping(vec!["foo", "bar", "baz", "bar", "baz"]);
        assert!(mapping.is_defined(&2));
        assert_eq!(mapping.apply(&2), Some(&"baz"));
        assert!(!mapping.is_defined(&10));
        assert_eq!(mapping.apply(&10), None);

        let preimage: Vec<_> = mapping.preimage(&"bar").collect();
        assert_eq!(preimage, vec![1,3]);
    }

    #[test]
    fn indexed_vec_mapping() {
        let mapping = IndexedVecMapping::new(vec!["foo", "bar", "baz", "bar"]);
        assert!(mapping.is_defined(&2));
        assert_eq!(mapping.apply(&2), Some(&"baz"));
        assert!(!mapping.is_defined(&10));
        assert_eq!(mapping.apply(&10), None);

        let preimage: Vec<_> = mapping.preimage(&"bar").collect();
        assert_eq!(preimage, vec![1,3]);
        let preimage: Vec<_> = mapping.preimage(&"biz").collect();
        assert!(preimage.is_empty());
    }
}
