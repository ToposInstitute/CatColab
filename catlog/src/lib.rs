use std::hash::Hash;
use std::collections::HashSet;

pub trait Set {
    type Elem;

    fn contains(&self, x: &Self::Elem) -> bool;
}

pub trait FinSet: Set {
    fn len(&self) -> usize;

    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[derive(Clone,Copy)]
pub struct FinSetSkel(usize);

impl Set for FinSetSkel {
    type Elem = usize;

    fn contains(&self, x: &usize) -> bool {
        *x < self.0
    }
}

impl FinSet for FinSetSkel {
    fn len(&self) -> usize { self.0 }
}

pub struct FinSetHash<T>(HashSet<T>);

impl<T: Eq + Hash> Set for FinSetHash<T> {
    type Elem = T;

    fn contains(&self, x: &T) -> bool { self.0.contains(x) }
}

impl<T: Eq + Hash> FinSet for FinSetHash<T> {
    fn len(&self) -> usize { self.0.len() }
    fn is_empty(&self) -> bool { self.0.is_empty() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fin_set_int() {
        let s = FinSetSkel(3);
        assert!(!s.is_empty());
        assert_eq!(s.len(), 3);
        assert!(s.contains(&2));
        assert!(!s.contains(&3));
    }
}
