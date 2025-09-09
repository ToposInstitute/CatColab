/*! Directories. */

use crate::tt::prelude::*;

/** An entry in a [Dtry].

We use naming conventions from UNIX directories to name the variants of this
enum.
*/
#[derive(Clone)]
pub enum DtryEntry<T> {
    /// A leaf node
    File(T),
    /// An internal node
    SubDir(Dtry<T>),
}

impl<T> DtryEntry<T> {
    /// Produce a new directory given by mapping `f` over all of the
    /// [DtryEntry::File] nodes.
    pub fn map<S>(&self, f: &impl Fn(&T) -> S) -> DtryEntry<S> {
        match self {
            DtryEntry::File(x) => DtryEntry::File(f(x)),
            DtryEntry::SubDir(d) => DtryEntry::SubDir(d.map(f)),
        }
    }

    /// Part of [[crate::tt::val::TyV::specialize]]
    // `A : DtryEntry` is a *refinement* of `B : DtryEntry` if either:
    //
    // 1. `A` and `B` are both files. Then their merge is given by `B`.
    // 2. `A` and `B` are both subdirectories. Then their merge is given
    // by `Dtry::merge`.
    pub fn merge(&self, other: DtryEntry<T>) -> DtryEntry<T> {
        todo!()
    }
}

/** A directory.

A `Dtry<T>` consists of a mapping from `FieldName`s to directory
entries, where a directory entry is either a "File" ([DtryEntry::File]),
that is an element of `T`, or a "subdirectory" ([DtryEntry::SubDir]),
which is just another directory.

The terminology is slightly different from [the directories paper][1];
in the directories paper we call [DtryEntry] a directory, and [Dtry] is
just the internal node case of [DtryEntry] (internal node as opposed to
leaf node). This makes `Dtry` no longer a monad (there isn't a unit),
but it's slightly more convenient for our use case here (keeping track
of specializations).

[1]: https://arxiv.org/abs/2504.19389
*/
#[derive(Clone)]
pub struct Dtry<T>(Row<DtryEntry<T>>);

impl<T> Dtry<T> {
    /// Produce a new directory given by mapping `f` over all of the
    /// [DtryEntry::File] nodes.
    pub fn map<S>(&self, f: &impl Fn(&T) -> S) -> Dtry<S> {
        Dtry(self.0.iter().map(|(name, e)| (*name, e.map(f))).collect())
    }

    /// Constructor for the empty directory
    pub fn empty() -> Dtry<T> {
        Dtry(Row::empty())
    }

    /// Part of [[crate::tt::val::TyV::specialize]]
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
