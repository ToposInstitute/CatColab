use crate::tt::prelude::*;

#[derive(Clone)]
pub enum DtryEntry<T> {
    File(T),
    SubDir(Dtry<T>),
}

impl<T> DtryEntry<T> {
    pub fn map<S>(&self, f: &impl Fn(&T) -> S) -> DtryEntry<S> {
        match self {
            DtryEntry::File(x) => DtryEntry::File(f(x)),
            DtryEntry::SubDir(d) => DtryEntry::SubDir(d.map(f)),
        }
    }

    // `A : DtryEntry` is a *refinement* of `B : DtryEntry` if either:
    //
    // 1. `A` and `B` are both files. Then their merge is given by `B`.
    // 2. `A` and `B` are both subdirectories. Then their merge is given
    // by `Dtry::merge`.
    pub fn merge(&self, other: DtryEntry<T>) -> DtryEntry<T> {
        todo!()
    }
}

#[derive(Clone)]
pub struct Dtry<T>(Row<DtryEntry<T>>);

impl<T> Dtry<T> {
    pub fn map<S>(&self, f: &impl Fn(&T) -> S) -> Dtry<S> {
        Dtry(self.0.iter().map(|(name, e)| (*name, e.map(f))).collect())
    }

    pub fn empty() -> Dtry<T> {
        Dtry(Row::empty())
    }

    // `A : Dtry` is a *refinement* of `B : Dtry` if, for every
    // key `k` shared between `A` and `B`, `A[k]` is a refinement
    // of `B[k]`.
    //
    // See the definition of refinement at [[DtryEntry::merge]]
    // for more information.
    //
    // Precondition: other must be a *refinement* of self
    pub fn merge(&self, other: Dtry<T>) -> Dtry<T> {
        todo!()
    }
}
