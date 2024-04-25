use std::ops::Range;
use std::hash::Hash;
use std::collections::HashSet;

/** An arbitrary set.

The interface is minimal. A set has an element type (`Elem`) and can check
whether a value of that type belongs to the set.
 */
pub trait Set {
    type Elem;

    /// Does the set contain the element `x`?
    fn contains(&self, x: &Self::Elem) -> bool;
}

/** A finite set.

Finite sets know their size and are iterable.
 */
pub trait FinSet: Set + IntoIterator {
    /// Returns the size of the finite set.
    fn len(&self) -> usize;

    /// Is the set empty?
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/** A skeletal finite set.

The elements of the skeletal finite set of size `n` are the numbers `0..n`
(excluding `n`).
 */
#[derive(Clone,Copy)]
pub struct FinSetSkel(usize);

impl Set for FinSetSkel {
    type Elem = usize;

    fn contains(&self, x: &usize) -> bool {
        *x < self.0
    }
}

impl IntoIterator for FinSetSkel {
    type Item = usize;
    type IntoIter = Range<usize>;

    fn into_iter(self) -> Self::IntoIter {
        0..(self.0)
    }
}

impl FinSet for FinSetSkel {
    fn len(&self) -> usize { self.0 }
}

/// A finite set backed by a hash set.
pub struct FinSetHash<T>(HashSet<T>);

impl<T: Eq + Hash> Set for FinSetHash<T> {
    type Elem = T;

    fn contains(&self, x: &T) -> bool { self.0.contains(x) }
}

impl<T: Eq + Hash> IntoIterator for FinSetHash<T> {
    type Item = T;
    type IntoIter = std::collections::hash_set::IntoIter<T>;

    fn into_iter(self) -> Self::IntoIter { self.0.into_iter() }
}
impl<T: Eq + Hash> FinSet for FinSetHash<T> {
    fn len(&self) -> usize { self.0.len() }
    fn is_empty(&self) -> bool { self.0.is_empty() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fin_set_skel() {
        let s = FinSetSkel(3);
        assert!(!s.is_empty());
        assert_eq!(s.len(), 3);
        assert!(s.contains(&2));
        assert!(!s.contains(&3));
        let elems: Vec<usize> = s.into_iter().collect();
        assert_eq!(elems, vec![0,1,2]);
    }
}
