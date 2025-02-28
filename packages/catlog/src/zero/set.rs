/*! Sets, finite and infinite.

This module provides interfaces and simple wrapper types to enable sets to be
treated in a generic way.
 */

use std::collections::HashSet;
use std::hash::{BuildHasher, BuildHasherDefault, Hash, RandomState};
use std::ops::Range;

use derivative::Derivative;
use derive_more::{From, Into};
use ref_cast::RefCast;
use ustr::{IdentityHasher, Ustr};

/** A set.

The interface is minimal. A set has an element type ([`Elem`](Self::Elem)) and
can check whether values of that type belongs to the set. Sets are not assumed
to be finite.
 */
pub trait Set {
    /** Type of elements of the set.

    Elements can be compared for equality, as required by ordinary mathematics.
    Elements can also be cloned and, in practice, we tend to assume that they
    can be *cheaply* cloned.
    */
    type Elem: Eq + Clone;

    /// Does the set contain the element `x`?
    fn contains(&self, x: &Self::Elem) -> bool;
}

/** A finite set.

In addition to checking for element containment, finite sets know their size and
are iterable. The elements of a finite set are assumed to be cheaply cloneable
values, such as integers or interned strings. Thus, iteration of elements is by
value, not by reference.
 */
pub trait FinSet: Set {
    /** Iterates over elements of the finite set.

    Though finite sets have a definite size, the iterator is not required to be
    an [`ExactSizeIterator`] because they are not stable under even predictable
    operations like chaining. Instead, retrieve the size of the set through the
    separate method [`len`](FinSet::len).
    */
    fn iter(&self) -> impl Iterator<Item = Self::Elem>;

    /// The size of the finite set.
    fn len(&self) -> usize {
        self.iter().count()
    }

    /// Is the set empty?
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/** A skeletal finite set.

The elements of the skeletal finite set of size `n` are the numbers `0..n`
(excluding `n`).
 */
#[derive(Clone, Copy, Debug, From, Into, PartialEq, Eq, RefCast)]
#[repr(transparent)]
pub struct SkelFinSet(usize);

impl SkelFinSet {
    /// Adds the (unique possible) next element to the skeletal finite set.
    pub fn insert(&mut self) -> usize {
        let new = self.0;
        self.0 += 1;
        new
    }

    /// Adds the next `n` elements to the skeletal finite set.
    pub fn extend(&mut self, n: usize) -> Range<usize> {
        let start = self.0;
        self.0 += n;
        start..(self.0)
    }
}

impl Default for SkelFinSet {
    fn default() -> Self {
        Self::from(0)
    }
}

impl Set for SkelFinSet {
    type Elem = usize;

    fn contains(&self, x: &usize) -> bool {
        *x < self.0
    }
}

impl FinSet for SkelFinSet {
    fn iter(&self) -> impl Iterator<Item = usize> {
        0..(self.0)
    }
    fn len(&self) -> usize {
        self.0
    }
}

impl IntoIterator for SkelFinSet {
    type Item = usize;
    type IntoIter = Range<usize>;

    fn into_iter(self) -> Self::IntoIter {
        0..(self.0)
    }
}

/// A finite set backed by a hash set.
#[derive(Clone, Debug, From, Into, Derivative)]
#[derivative(Default(bound = "S: Default"))]
#[derivative(PartialEq(bound = "T: Eq + Hash, S: BuildHasher"))]
#[derivative(Eq(bound = "T: Eq + Hash, S: BuildHasher"))]
pub struct HashFinSet<T, S = RandomState>(HashSet<T, S>);

/// A finite set with elements of type `Ustr`.
pub type UstrFinSet = HashFinSet<Ustr, BuildHasherDefault<IdentityHasher>>;

impl<T, S> HashFinSet<T, S>
where
    T: Eq + Hash,
    S: BuildHasher,
{
    /// Adds an element to the set.
    pub fn insert(&mut self, x: T) -> bool {
        self.0.insert(x)
    }
}

impl<T, S> Extend<T> for HashFinSet<T, S>
where
    T: Eq + Hash,
    S: BuildHasher,
{
    fn extend<Iter>(&mut self, iter: Iter)
    where
        Iter: IntoIterator<Item = T>,
    {
        self.0.extend(iter)
    }
}

impl<T, S> Set for HashFinSet<T, S>
where
    T: Eq + Clone + Hash,
    S: BuildHasher,
{
    type Elem = T;

    fn contains(&self, x: &T) -> bool {
        self.0.contains(x)
    }
}

impl<T, S> FinSet for HashFinSet<T, S>
where
    T: Eq + Hash + Clone,
    S: BuildHasher,
{
    fn iter(&self) -> impl Iterator<Item = T> {
        self.0.iter().cloned()
    }
    fn len(&self) -> usize {
        self.0.len()
    }
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<T, S> IntoIterator for HashFinSet<T, S>
where
    T: Eq + Hash,
    S: BuildHasher,
{
    type Item = T;
    type IntoIter = std::collections::hash_set::IntoIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

/** A skeletal finite set with a data attribute.

The internal representation is simply a vector.
*/
#[derive(Clone, Debug, From, Derivative)]
#[derivative(Default(bound = ""))]
#[derivative(PartialEq(bound = "T: PartialEq"))]
#[derivative(Eq(bound = "T: Eq"))]
pub struct AttributedSkelSet<T>(Vec<T>);

impl<T> AttributedSkelSet<T> {
    /// Adds a new element with an associated data value.
    pub fn insert(&mut self, value: T) -> usize {
        let new = self.0.len();
        self.0.push(value);
        new
    }

    /// Adds multiple new elements with associated values.
    pub fn extend<Iter>(&mut self, iter: Iter) -> Range<usize>
    where
        Iter: IntoIterator<Item = T>,
    {
        let start = self.0.len();
        self.0.extend(iter);
        start..(self.0.len())
    }

    /// View the data value associated with an element.
    pub fn view(&self, x: usize) -> &T {
        &self.0[x]
    }
}

impl<T> Set for AttributedSkelSet<T> {
    type Elem = usize;

    fn contains(&self, x: &usize) -> bool {
        *x < self.0.len()
    }
}

impl<T> FinSet for AttributedSkelSet<T> {
    fn iter(&self) -> impl Iterator<Item = usize> {
        0..(self.0.len())
    }
    fn len(&self) -> usize {
        self.0.len()
    }
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skel_fin_set() {
        let mut s: SkelFinSet = Default::default();
        assert!(s.is_empty());
        assert_eq!(s.insert(), 0);
        assert!(!s.is_empty());
        assert_eq!(s.extend(2), 1..3);
        assert_eq!(s.len(), 3);
        assert!(s.contains(&2));
        assert!(!s.contains(&3));
        let n: usize = s.into();
        assert_eq!(n, 3);

        let s = SkelFinSet::from(3);
        let sum: usize = s.iter().sum();
        assert_eq!(sum, 3);
        let elems: Vec<usize> = s.into_iter().collect();
        assert_eq!(elems, vec![0, 1, 2]);
    }

    #[test]
    fn hash_fin_set() {
        let mut s: HashFinSet<i32> = Default::default();
        assert!(s.is_empty());
        s.insert(3);
        s.extend([5, 7]);
        assert!(!s.is_empty());
        assert_eq!(s.len(), 3);
        assert!(s.contains(&3));
        assert!(s.contains(&7));
        assert!(!s.contains(&2));

        let mut s2: HashFinSet<i32> = Default::default();
        s2.extend([7, 5, 3]);
        assert_eq!(s, s2);

        let s = HashFinSet::from(HashSet::from([3, 5, 7]));
        let sum: i32 = s.iter().sum();
        assert_eq!(sum, 15);
        assert_eq!(s.len(), 3);
    }

    #[test]
    fn attributed_skel_set() {
        let mut s: AttributedSkelSet<char> = Default::default();
        assert!(s.is_empty());
        assert_eq!(s.insert('a'), 0);
        assert_eq!(s.extend(['b', 'c'].into_iter()), 1..3);
        assert!(!s.is_empty());
        assert_eq!(s.len(), 3);
        assert!(s.contains(&2));
        assert!(!s.contains(&3));
        assert_eq!(*s.view(1), 'b');
    }
}
