/*! Indices.

We find it useful to distinguish between backward indices (used in syntax, where
0 refers to the *end* of the context) and forward indices (used in values, where
0 refers to the *beginning* of the context).

In the literature, backward indices are known as DeBruijn indices and forward
indices are known as DeBruijn levels, but we think that "backwards and forwards"
is more clear, and it corresponds with "backwards and forwards linked lists". A forwards linked list uses `cons` to put a new element on the front; a backwards
linked list uses `snoc` to put a new element on the back.

We take this terminology from [narya](https://github.com/gwaithimirdain/narya).
*/

use derive_more::From;
use std::ops::Deref;

/** Forward indices (aka DeBruijn levels)

Get the underlying `usize` using the [Deref] implementation.
*/
#[derive(Copy, Clone, PartialEq, Eq, Debug, From)]
pub struct FwdIdx(usize);

impl Deref for FwdIdx {
    type Target = usize;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl FwdIdx {
    /// The forward index refering the the next variable in the scope
    pub fn next(&self) -> Self {
        Self(self.0 + 1)
    }

    /// Convert into a backward index, assuming that the scope is of
    /// length `scope_length`
    pub fn as_bwd(&self, scope_length: usize) -> BwdIdx {
        BwdIdx(scope_length - self.0 - 1)
    }
}

/** Backward indices (aka DeBruijn indices).

Get the underlying `usize` using the [Deref] implementation.
*/
#[derive(Copy, Clone, PartialEq, Eq, Debug, From)]
pub struct BwdIdx(usize);

impl Deref for BwdIdx {
    type Target = usize;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl BwdIdx {
    /// The backwards index refering to the previous variable in the scope
    pub fn prev(&self) -> Self {
        Self(self.0 + 1)
    }
}
