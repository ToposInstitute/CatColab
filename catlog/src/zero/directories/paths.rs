use archery::{SharedPointer, SharedPointerKind};
use smallvec::*;

/// A path in a K-indexed directory
#[derive(Clone, PartialEq, Eq)]
pub struct Path<K: Clone, P: SharedPointerKind>(Option<(K, SharedPointer<Path<K, P>, P>)>);

impl<K, P> Path<K, P>
where
    K: Clone,
    P: SharedPointerKind,
{
    pub fn root() -> Self {
        Path(None)
    }

    pub fn isroot(&self) -> bool {
        self.0.is_none()
    }

    pub fn uncons(&self) -> Option<(K, SharedPointer<Self, P>)> {
        self.0.clone()
    }

    pub fn concat(&self, other: Path<K>) -> Self {
        let mut new = self.0.clone();
        new.extend(other.0.iter().map(|k| k.clone()));
        Path(new)
    }

    pub fn cons(&self, k: K) -> Self {
        let mut new = SmallVec::new();
        new.push(k);
        new.extend(self.0.iter().map(|k| k.clone()));
        Path(new)
    }

    pub fn snoc(&self, k: K) -> Self {
        let mut new = self.0.clone();
        new.push(k);
        Path(new)
    }
}
