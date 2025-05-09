//! Names for compositional models, which are paths of name segments

use std::fmt;
use std::fmt::Write;
use std::hash::Hash;
use std::iter;
use std::rc::Rc;

use ustr::Ustr;
use uuid::Uuid;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

/// A segment of a [QualifiedName]
#[derive(Clone, Copy, Debug)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct Segment {
    /// Index into the relevant scope, counting forward
    ///
    /// This is the logical component of the segment; the other two fields are
    /// not relevant to computations happening in catlog, but may be relevant to
    /// the frontend.
    fwd_idx: usize,
    /// The human-readable name associated with the segment.
    name: Option<Ustr>,
    /// The uuid associated with the segment. This may not exist when we are
    /// parsing a notebook from plaintext.
    id: Option<Uuid>,
}

impl Segment {
    /// Create a new segment. The most important parameter is the fwd_idx, and
    /// in fact this is the only parameter used in equality comparison or
    /// hashing.
    ///
    /// Other parameters may be passed with the builder methods `.with_name(..)`
    /// or `.with_id(..)`
    pub fn new(fwd_idx: usize) -> Self {
        Segment {
            fwd_idx,
            name: None,
            id: None,
        }
    }

    /// Set the name field immutably, creating a new segment.
    /// Useful when you already have an Option<Ustr>.
    pub fn set_name(&self, name: Option<Ustr>) -> Self {
        Segment { name, ..*self }
    }

    /// The same as `.set_name(Some(name))`
    pub fn with_name<S: Into<Ustr>>(&self, name: S) -> Self {
        Segment {
            name: Some(name.into()),
            ..*self
        }
    }

    /// Provide a UUID for this segment. This is for when the segment comes
    /// from a cell in a notebook, and the cell is identified by UUID.
    pub fn with_id(&self, id: Uuid) -> Self {
        Segment {
            id: Some(id),
            ..*self
        }
    }

    fn stable_name(&self, out: &mut String) {
        if let Some(id) = self.id {
            write!(out, "{}", id).unwrap();
        } else if let Some(name) = self.name {
            write!(out, "<{}>", name).unwrap();
        } else {
            panic!("segment {self:?} has no stable name")
        }
    }
}

impl PartialEq for Segment {
    fn eq(&self, other: &Self) -> bool {
        self.fwd_idx == other.fwd_idx
    }
}

impl Eq for Segment {}

impl PartialOrd for Segment {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.fwd_idx.partial_cmp(&other.fwd_idx)
    }
}

impl Ord for Segment {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.fwd_idx.cmp(&other.fwd_idx)
    }
}

impl Hash for Segment {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        state.write_usize(self.fwd_idx);
    }
}

impl fmt::Display for Segment {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(name) = self.name {
            write!(f, "{}", name)?;
        } else if let Some(id) = self.id {
            write!(f, "{}", id)?;
        } else {
            write!(f, "#{}", self.fwd_idx)?;
        }
        Ok(())
    }
}

/// A name like `wheel.momentum.x`.
///
/// It would be asymptotically faster to use a linked list here to make `.snoc()`
/// O(1) rather than O(n), however
///
/// 1. These names probably won't be *that* long
/// 2. We are going to move this type across the typescript boundary a lot, and
///    that necessitates copying it anyways, most likely into an array because
///    we don't want to deal with linked lists in typescript.
///
/// We can however be slightly more efficient than `Rc<Vec<Segment>>` because
/// we know that we don't care about in-place mutation; using `Rc<[Segment]>`
/// saves on having to store the capacity field
#[derive(Clone, Debug, Hash, PartialEq, Eq, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct QualifiedName {
    /// Can be empty, which represents the top-level namespace
    segments: Rc<[Segment]>,
}

impl QualifiedName {
    /// The top-level namespace
    pub fn empty() -> Self {
        QualifiedName {
            segments: Rc::new([]),
        }
    }

    /// The same as `.empty().snoc(segment)` but slightly more efficient.
    pub fn singleton(segment: Segment) -> Self {
        QualifiedName {
            segments: Rc::new([segment]),
        }
    }

    /// Immutable access to the slice of segments
    pub fn segments(&self) -> &[Segment] {
        &self.segments
    }

    /// Add a segment to the end of the qualified name
    pub fn extend(&self, segment: Segment) -> Self {
        QualifiedName {
            segments: self.segments.iter().copied().chain(iter::once(segment)).collect(),
        }
    }

    /// Produce a string representation that should be stable with respect
    /// to renaming and reshufflings in the notebook
    pub fn stable_name(&self) -> String {
        let mut out = String::new();
        for seg in self.segments.iter() {
            seg.stable_name(&mut out);
            write!(out, " ").unwrap();
        }
        out.pop();
        out
    }
}

impl fmt::Display for QualifiedName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for segment in self.segments[..self.segments.len() - 1].iter() {
            write!(f, "{}.", segment)?;
        }
        write!(f, "{}", self.segments.last().unwrap())?;
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use expect_test::{Expect, expect};

    use super::{QualifiedName, Segment};

    fn test(name: QualifiedName, expected: Expect) {
        expected.assert_eq(&format!("{}", name));
    }

    #[test]
    fn segment_tests() {
        test(QualifiedName::singleton(Segment::new(0).with_name("a")), expect!["a"]);
        test(
            QualifiedName::singleton(Segment::new(0).with_name("b"))
                .extend(Segment::new(0).with_name("x")),
            expect!["b.x"],
        )
    }
}
