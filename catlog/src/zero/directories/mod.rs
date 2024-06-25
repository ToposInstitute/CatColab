pub mod nonemptymap;
pub mod paths;

pub use nonemptymap::*;
pub use paths::*;

use archery::*;
use std::collections::HashMap;
use std::hash::Hash;

/// Non-empty directories
#[derive(PartialEq, Eq)]
enum NonEmptyDir<K: Hash + Eq + Clone, V, P: SharedPointerKind> {
    Leaf(SharedPointer<V, P>),
    Node(HashMap<K, SharedPointer<NonEmptyDir<K, V, P>, P>>),
}
use NonEmptyDir::*;

impl<K, V, P> Clone for NonEmptyDir<K, V, P>
where
    K: Hash + Eq + Clone,
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
    K: Hash + Eq + Clone,
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
            Node(m) => Node(HashMap::from_iter(
                m.iter()
                    .map(|(k, d)| (k.clone(), SharedPointer::new(d.map(f)))),
            )),
        }
    }

    fn get(&self, p: &Path<K>) -> Option<&V> {
        match (self, p.uncons()) {
            (Leaf(v), None) => Some(v),
            (Node(m), Some((k, p))) => m.get(&k).and_then(|ned| ned.get(&p)),
            _ => None,
        }
    }

    fn insert(&mut self, p: &Path<K>, v: V) -> Option<()> {
        match (self, p.uncons()) {
            (Leaf(old_v), None) => {
                *old_v = SharedPointer::new(v);
                Some(())
            }
            (Node(m), Some((k, p))) => match m.get_mut(&k) {
                None => {
                    m.insert(k, SharedPointer::new(NonEmptyDir::singleton(&p, v)));
                    Some(())
                }
                Some(ned) => SharedPointer::make_mut(ned).insert(&p, v),
            },
            _ => None,
        }
    }

    fn singleton(p: &Path<K>, v: V) -> Self {
        match p.uncons() {
            None => Leaf(SharedPointer::new(v)),
            Some((k, p)) => {
                let mut m = HashMap::new();
                m.insert(k, SharedPointer::new(NonEmptyDir::singleton(&p, v)));
                Node(m)
            }
        }
    }

    fn try_from_iter<T: IntoIterator<Item = (K, SharedPointer<NonEmptyDir<K, V, P>, P>)>>(
        iter: T,
    ) -> Option<NonEmptyDir<K, V, P>> {
        let mut iter = iter.into_iter();
        match iter.next() {
            None => None,
            Some((k, m)) => {
                let mut map = HashMap::new();
                map.insert(k, m);
                map.extend(iter);
                Some(NonEmptyDir::Node(map))
            }
        }
    }
}

/// Possibly-empty directory
pub struct Dir<K: Hash + Eq + Clone, V, P: SharedPointerKind>(Option<NonEmptyDir<K, V, P>>);

impl<K, V, P> Dir<K, V, P>
where
    K: Hash + Eq + Clone,
    P: SharedPointerKind,
{
    /// Create a new directory with the same shape as self, but
    /// whose values are mapped over by f
    pub fn map<W, F>(&self, f: &F) -> Dir<K, W, P>
    where
        F: Fn(&V) -> W,
    {
        match self {
            Dir(Some(ned)) => Dir(Some(ned.map(f))),
            _ => Dir(None),
        }
    }

    pub fn get(&self, p: &Path) ->
}
