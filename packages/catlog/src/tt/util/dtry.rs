/*! Directories. */

use crate::{tt::prelude::*, zero::QualifiedName};

/** An entry in a [Dtry].

We use naming conventions from UNIX directories to name the variants of this
enum.
*/
#[derive(Clone)]
pub enum DtryEntry<T> {
    /// A leaf node.
    File(T),
    /// An internal node.
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
}

impl<T: Clone> DtryEntry<T> {
    fn flatten_into(&self, namespace: QualifiedName, out: &mut Vec<(QualifiedName, T)>) {
        match self {
            DtryEntry::File(x) => out.push((namespace, x.clone())),
            DtryEntry::SubDir(d) => d.flatten_into(namespace, out),
        }
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

    /// Constructor for the empty directory.
    pub fn empty() -> Dtry<T> {
        Dtry(Row::empty())
    }

    /// Iterate through the entries of the directory
    pub fn entries(&self) -> impl Iterator<Item = (&FieldName, &DtryEntry<T>)> {
        self.0.iter()
    }

    /// Get the entry for `field` if it exists
    pub fn entry(&self, field: &FieldName) -> Option<&DtryEntry<T>> {
        self.0.get(*field)
    }
}

impl<T: Clone> Dtry<T> {
    /// Produce the list of paths in `self` that refer to files, along with the
    /// value of the files that they refer to
    pub fn flatten(&self) -> Vec<(QualifiedName, T)> {
        let mut out = Vec::new();
        self.flatten_into(vec![].into(), &mut out);
        out
    }

    fn flatten_into(&self, namespace: QualifiedName, out: &mut Vec<(QualifiedName, T)>) {
        for (field, entry) in self.entries() {
            entry.flatten_into(namespace.snoc(*field), out)
        }
    }
}

impl<T> From<IndexMap<FieldName, DtryEntry<T>>> for Dtry<T> {
    fn from(value: IndexMap<FieldName, DtryEntry<T>>) -> Self {
        Self(value.into())
    }
}
