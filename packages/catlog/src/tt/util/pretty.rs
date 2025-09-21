//! Helper functions for writing pretty-printers.

use pretty::RcDoc;
use std::{borrow::Cow, fmt, ops};

/// A wrapper around RcDoc that allows us to add some new methods, and also is
/// shorter to type.
///
/// In particular, we implement [ops::Add], which allows concatenating docs with
/// `+`.
#[derive(Clone)]
pub struct D<'a>(pub RcDoc<'a, ()>);

impl<'a> ops::Add for D<'a> {
    type Output = D<'a>;

    fn add(self, rhs: Self) -> Self::Output {
        D(self.0.append(rhs.0))
    }
}

/// Creates a text doc.
pub fn t<'a, U: Into<Cow<'a, str>>>(data: U) -> D<'a> {
    D(RcDoc::text(data))
}

/// Creates a space.
pub fn s<'a>() -> D<'a> {
    D(RcDoc::line())
}

/// Creates a binary operator applied to two arguments.
pub fn binop<'a>(op: &'a str, l: D<'a>, r: D<'a>) -> D<'a> {
    ((l + s() + t(op)).group() + (s() + r).indented()).group()
}

/// Creates a tuple in [fnotation]: (`[x, y, z, ...]`)
pub fn tuple<'a, I: IntoIterator<Item = D<'a>>>(i: I) -> D<'a> {
    D(RcDoc::intersperse(i.into_iter().map(|d| d.0.group()), (t(",") + s()).0))
        .brackets()
        .group()
}

impl<'a> D<'a> {
    /// Try to lay out this document as a group; either on one line or uniformly split
    pub fn group(self) -> D<'a> {
        D(self.0.group())
    }

    /// Surround this document with parentheses
    pub fn parens(self) -> D<'a> {
        t("(") + self.group() + t(")")
    }

    /// Increase the indentation level
    pub fn indented(self) -> Self {
        D(self.0.nest(2))
    }

    /// Surround this document with brackets
    pub fn brackets(self) -> D<'a> {
        t("[") + (s() + self + s()).indented() + t("]")
    }

    /// Use this to print a document
    pub fn pretty(&self) -> impl fmt::Display {
        self.0.pretty(80)
    }
}
