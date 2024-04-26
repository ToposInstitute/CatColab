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

/** An iterable with lifetime parameter.

*Source*: the Generic Associated Types
[Explainer](https://rust-lang.github.io/generic-associated-types-initiative/explainer/iterable.html)
 */
pub trait Iterable {
    type Item<'a> where Self: 'a;
    type Iter<'a>: Iterator<Item = Self::Item<'a>> where Self: 'a;

    fn iter<'a>(&'a self) -> Self::Iter<'a>;
}

/** A finite set.

Finite sets know their size and are iterable.
 */
pub trait FinSet: Set + IntoIterator + Iterable {
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

impl Iterable for FinSetSkel {
    type Item<'a> = usize;
    type Iter<'a> = Range<usize>;

    fn iter(&self) -> Self::Iter<'_> {
        0..(self.0)
    }
}

impl IntoIterator for FinSetSkel {
    type Item = usize;
    type IntoIter = Range<usize>;

    fn into_iter(self) -> Self::IntoIter { self.iter() }
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

impl<T: Eq + Hash> Iterable for FinSetHash<T> {
    type Item<'a> = &'a T where T: 'a;
    type Iter<'a> = std::collections::hash_set::Iter<'a,T> where T: 'a;

    fn iter<'a>(&'a self) -> Self::Iter<'a> { self.0.iter() }
}

impl<T: Eq + Hash> FinSet for FinSetHash<T> {
    fn len(&self) -> usize { self.0.len() }
    fn is_empty(&self) -> bool { self.0.is_empty() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fin_set_skel_basics() {
        let s = FinSetSkel(3);
        assert!(!s.is_empty());
        assert_eq!(s.len(), 3);
        assert!(s.contains(&2));
        assert!(!s.contains(&3));
    }

    #[test]
    fn fin_set_skel_iter() {
        let s = FinSetSkel(3);
        let sum: usize = s.iter().sum();
        assert_eq!(sum, 3);
        let elems: Vec<usize> = s.into_iter().collect();
        assert_eq!(elems, vec![0,1,2]);
    }

    #[test]
    fn fin_set_hash_basics() {
        let s = FinSetHash(HashSet::from([3, 5, 7]));
        assert!(!s.is_empty());
        assert_eq!(s.len(), 3);
        assert!(!s.contains(&2));
        assert!(s.contains(&3));
    }

    #[test]
    fn fin_set_hash_iter() {
        let s = FinSetHash(HashSet::from([3, 5, 7]));
        let sum: i32 = s.iter().sum();
        assert_eq!(sum, 15);
        assert_eq!(s.len(), 3);
    }
}
