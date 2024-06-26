//! Directories and associated operations

pub mod paths;

pub use paths::*;

use archery::*;
use std::collections::BTreeMap;

/// Non-empty directories
#[derive(PartialEq, Eq)]
enum NonEmptyDir<K: Ord + Eq + Clone, V, P: SharedPointerKind> {
    Leaf(SharedPointer<V, P>),
    Node(SharedPointer<BTreeMap<K, NonEmptyDir<K, V, P>>, P>),
}
use NonEmptyDir::*;

impl<K, V, P> Clone for NonEmptyDir<K, V, P>
where
    K: Ord + Eq + Clone,
    P: SharedPointerKind,
{
    fn clone(&self) -> Self {
        match self {
            Leaf(v) => Leaf(v.clone()),
            Node(m) => Node(m.clone()),
        }
    }
}

impl<K, V, P> NonEmptyDir<K, V, P>
where
    K: Ord + Eq + Clone,
    P: SharedPointerKind,
{
    /// Produce a new non-empty directory with the same shape as self,
    /// whose values are transformed by f
    fn map<W, F>(&self, f: &F) -> NonEmptyDir<K, W, P>
    where
        F: Fn(&V) -> W,
    {
        match self {
            Leaf(v) => Leaf(SharedPointer::new(f(v))),
            Node(m) => Node(SharedPointer::new(BTreeMap::from_iter(
                m.iter().map(|(k, d)| (k.clone(), d.map(f))),
            ))),
        }
    }

    fn get(&self, p: &Path<K, P>) -> Option<&V> {
        match (self, p.uncons()) {
            (Leaf(v), None) => Some(v),
            (Node(m), Some((k, p))) => m.get(&k).and_then(|ned| ned.get(&p)),
            _ => None,
        }
    }

    fn insert_mut(&mut self, p: &Path<K, P>, v: V) -> Option<()> {
        match (self, p.uncons()) {
            (Leaf(old_v), None) => {
                *old_v = SharedPointer::new(v);
                Some(())
            }
            (Node(m), Some((k, p))) => {
                let m = SharedPointer::make_mut(m);
                match m.get_mut(&k) {
                    None => {
                        m.insert(k, NonEmptyDir::singleton(&p, v));
                        Some(())
                    }
                    Some(ned) => ned.insert_mut(&p, v),
                }
            }
            _ => None,
        }
    }

    fn singleton(p: &Path<K, P>, v: V) -> Self {
        match p.uncons() {
            None => Leaf(SharedPointer::new(v)),
            Some((k, p)) => {
                let mut m = BTreeMap::new();
                m.insert(k, NonEmptyDir::singleton(&p, v));
                Node(SharedPointer::new(m))
            }
        }
    }

    fn try_from_iter<T: IntoIterator<Item = (K, NonEmptyDir<K, V, P>)>>(
        iter: T,
    ) -> Option<NonEmptyDir<K, V, P>> {
        let mut iter = iter.into_iter();
        match iter.next() {
            None => None,
            Some((k, m)) => {
                let mut map = BTreeMap::new();
                map.insert(k, m);
                map.extend(iter);
                Some(NonEmptyDir::Node(SharedPointer::new(map)))
            }
        }
    }

    pub fn filter_flatmap<W, F: Fn(&V) -> Option<NonEmptyDir<K, W, P>>>(
        &self,
        f: F,
    ) -> Option<NonEmptyDir<K, W, P>> {
        match self {
            Leaf(v) => f(v),
            Node(m) => {
                let m_next: BTreeMap<K, NonEmptyDir<K, W, P>> = m
                    .iter()
                    .filter_map(|(k, ned)| {
                        ned.filter_flatmap(&f).map(|ned| (k.clone(), ned.clone()))
                    })
                    .collect();
                if m_next.len() == 0 {
                    None
                } else {
                    Some(Node(SharedPointer::new(m_next)))
                }
            }
        }
    }
}

impl<K, V, P> NonEmptyDir<K, NonEmptyDir<K, V, P>, P>
where
    K: Ord + Eq + Clone,
    P: SharedPointerKind,
{
    fn flatten(&self) -> NonEmptyDir<K, V, P> {
        match self {
            Leaf(ned) => ned.as_ref().clone(),
            Node(m) => Node(SharedPointer::new(
                m.iter()
                    .map(|(p, ned)| (p.clone(), ned.flatten()))
                    .collect(),
            )),
        }
    }
}

/// A directory is a special type of [trie][1] which only stores values at root nodes.
///
/// Conceptually, this can be thought of as a map from [`Path<K, P>`]s to values,
/// such that the domain of the map is *prefix-free* (no path in the domain is a
/// prefix of any other path).
///
/// One intended use for directories is to manage the namespace of variables in a
/// scientific model. Directories allow models to be composed without their variable names
/// clashing. In accordance with this intended use, directories store each node
/// (which is a mapping from elements of `K` to subdirectories) in sorted order,
/// so that iterating through directories happens in a predictable, deterministic order.
/// Specifically, iterating through all paths in a directory happens in lexicographic order.
///
/// Mainly, this implementation is a tree with reference-counted pointers. This means that
/// multiple directories may share subdirectories. Directories are also cheap to clone.
/// However we take advantage of [`SharedPointer::make_mut`] in order
/// to mutate in-place when the reference count of a pointer tells us that no other
/// references to a given value are live. Thus, we also have mutating methods. Of course,
/// these mutating methods can only be called when the caller has exclusive access.
/// This strategy for blending mutation and persistent data structures is inspired by
/// the [Perceus garbage collector][2].
///
/// [1]: https://en.wikipedia.org/wiki/Trie
/// [2]: https://koka-lang.github.io/koka/doc/book.html#why-fbip
pub struct Dir<K: Ord + Eq + Clone, V, P: SharedPointerKind>(Option<NonEmptyDir<K, V, P>>);

impl<K, V, P> Clone for Dir<K, V, P>
where
    K: Ord + Eq + Clone,
    P: SharedPointerKind,
{
    fn clone(&self) -> Self {
        Dir(self.0.clone())
    }
}

impl<K, V, P> Dir<K, V, P>
where
    K: Ord + Eq + Clone,
    P: SharedPointerKind,
{
    /// Returns the empty directory
    pub fn empty() -> Self {
        Dir(None)
    }

    /// Returns a new directory with the same domain as self, but
    /// whose value at path `p` is given by applying `f` to the value at `p` in `self`.
    pub fn map<W, F>(&self, f: &F) -> Dir<K, W, P>
    where
        F: Fn(&V) -> W,
    {
        match &self.0 {
            Some(ned) => Dir(Some(ned.map(f))),
            _ => Dir(None),
        }
    }

    /// Returns a reference to the value corresponding to the path.
    pub fn get(&self, p: &Path<K, P>) -> Option<&V> {
        match &self.0 {
            None => None,
            Some(ned) => ned.get(p),
        }
    }

    /// Attempts to insert `v` at path `p` via in-place mutation. If `p`
    /// is a prefix of any path that is currently in `self`, then this will return
    /// `None` and not perform any mutation.
    pub fn insert_mut(&mut self, p: &Path<K, P>, v: V) -> Option<()> {
        match &mut self.0 {
            None => {
                *self = Dir(Some(NonEmptyDir::singleton(p, v)));
                Some(())
            }
            Some(ned) => ned.insert_mut(p, v),
        }
    }

    /// Attempts to create a copy of `self` with `v` inserted at path `p`.
    /// If `p` is a prefix of any path that is currently in `self`, then
    /// this will return `None`.
    pub fn insert(&self, p: &Path<K, P>, v: V) -> Option<Self> {
        let mut d: Self = self.clone();
        d.insert_mut(p, v).map(|_| d)
    }
}

impl<K, V, P> Dir<K, Dir<K, V, P>, P>
where
    K: Ord + Eq + Clone,
    P: SharedPointerKind,
{
    /// Returns a new directory whose paths are given by `p1.concat(p2)` where
    /// `p1` is in the domain of self, and `p2` is in the domain of `self[p1]`,
    /// and whose value at `p1.concat(p2)` is `self[p1][p2]`.
    ///
    /// This is the fundamental namespacing operation for directories; if we have
    /// a directory of models that we wish to compose, the directory of variables
    /// in the composite model is given by flattening.
    pub fn flatten(&self) -> Dir<K, V, P> {
        match &self.0 {
            None => Dir(None),
            Some(ned) => Dir(ned.filter_flatmap(|d| d.0.clone())),
        }
    }
}
