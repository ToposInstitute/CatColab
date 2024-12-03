use std::{collections::HashSet, hash::Hash};

pub trait Set {
    type Elem;

    fn contains(&self, x: &Self::Elem) -> bool;
}

pub trait FinSet: Set {
    fn iter(&self) -> impl Iterator<Item = Self::Elem>;

    fn len(&self) -> usize {
        self.iter().count()
    }

    fn isempty(&self) -> bool {
        self.len() == 0
    }
}

pub struct SkelFinSet(usize);

impl Set for SkelFinSet {
    type Elem = usize;

    fn contains(&self, x: &usize) -> bool {
        *x < self.0
    }
}

impl FinSet for SkelFinSet {
    fn iter(&self) -> impl Iterator<Item = Self::Elem> {
        0..self.0
    }
}

struct HashFinSet<A>(HashSet<A>);

impl<A> Set for HashFinSet<A>
where
    A: Hash + Eq,
{
    type Elem = A;

    fn contains(&self, x: &A) -> bool {
        self.0.contains(x)
    }
}

impl<A> FinSet for HashFinSet<A>
where
    A: Hash + Eq + Clone,
{
    fn iter(&self) -> impl Iterator<Item = Self::Elem> {
        self.0.iter().map(|x| x.clone())
    }
}

pub trait Mapping {
    type Dom;
    type Cod;

    fn ap(&self, x: &Self::Dom) -> Self::Cod;
}

pub trait FinMapping: Mapping {
    fn fiber(&self, y: &Self::Cod) -> impl Iterator<Item = Self::Dom>;
}

pub struct SkelColumn(Vec<usize>);

impl Mapping for SkelColumn {
    type Dom = usize;
    type Cod = usize;

    fn ap(&self, x: &usize) -> usize {
        self.0[*x]
    }
}

impl FinMapping for SkelColumn {
    fn fiber(&self, y: &usize) -> impl Iterator<Item = usize> {
        self.0.iter().enumerate().filter(|(_, y2)| **y2 == *y).map(|(x, _)| x)
    }
}
