//! [`Path`] and associated operations

use archery::{SharedPointer, SharedPointerKind};

/// A linked list with element type `K`. Used for indexing into directories.
/// A path '/a/b/c' would be given by `Path::root().cons('c').cons('b').cons('a')`;
/// the first element of the list is the first element used for indexing into
/// a directory.
///
/// NOTE: This might conflict with paths for graphs?
///
/// NOTE: It might be more efficient to use a SmallVec instead of a linked list?
#[derive(PartialEq, Eq)]
pub struct Path<K: Clone, P: SharedPointerKind>(Option<(K, SharedPointer<Path<K, P>, P>)>);

impl<K, P> Clone for Path<K, P>
where
    K: Clone,
    P: SharedPointerKind,
{
    fn clone(&self) -> Self {
        Path(self.0.clone())
    }
}

impl<K, P> Path<K, P>
where
    K: Clone,
    P: SharedPointerKind,
{
    /// Returns the root (empty) path, equivalent to '/' in unix
    pub fn root() -> Self {
        Path(None)
    }

    /// Returns whether the path is the root
    pub fn isroot(&self) -> bool {
        self.0.is_none()
    }

    /// Returns the length of the path
    pub fn length(&self) -> usize {
        match &self.0 {
            None => 0,
            Some((_, p)) => 1 + p.length(),
        }
    }

    /// Destructs the path into the first element and rest of the path.
    pub fn uncons(&self) -> Option<(K, SharedPointer<Self, P>)> {
        self.0.clone()
    }

    /// Returns the concatenation of `self` and `other`. O(self.length())
    pub fn concat(&self, other: &Path<K, P>) -> Self {
        match &self.0 {
            None => other.clone(),
            Some((k, p)) => Path(Some((k.clone(), SharedPointer::new(p.concat(other))))),
        }
    }

    /// Adds `k` to the *front* of the list. O(1)
    pub fn cons(&self, k: K) -> Self {
        Path(Some((k, SharedPointer::new(self.clone()))))
    }

    /// Adds `k` to the *back* of the list. O(self.length())
    pub fn snoc(&self, k: K) -> Self {
        self.concat(&Path::root().cons(k))
    }
}
