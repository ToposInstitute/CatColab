pub trait FinSet {
    type Elem;

    fn len(&self) -> usize;
    fn contains(&self, x: Self::Elem) -> bool;

    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[derive(Clone,Copy)]
pub struct FinSetInt {
    n: usize,
}

impl FinSet for FinSetInt {
    type Elem = usize;

    fn len(&self) -> usize { self.n }
    fn contains(&self, x: usize) -> bool {
        x < self.n
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fin_set_int() {
        let s = FinSetInt { n: 3 };
        assert!(!s.is_empty());
        assert_eq!(s.len(), 3);
        assert!(s.contains(2));
        assert!(!s.contains(3));
    }
}
