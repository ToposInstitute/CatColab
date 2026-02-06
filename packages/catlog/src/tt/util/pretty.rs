//! Helper functions for writing pretty-printers.

use pretty::RcDoc;
use std::{borrow::Cow, fmt, ops};

/// A type that can be pretty-printed.
pub trait ToDoc {
    /// Pretty prints the object, returning a doc.
    fn to_doc<'a>(&self) -> D<'a>;
}

/// A wrapper around RcDoc with new methods and a shorter name.
///
/// In particular, we implement [ops::Add], which enables docs to be
/// concatenated with `+`.
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

/// Creates a soft line break (becomes a space when grouped).
pub fn s<'a>() -> D<'a> {
    D(RcDoc::line())
}

/// Creates a hard line break (always a newline).
pub fn hardline<'a>() -> D<'a> {
    D(RcDoc::hardline())
}

/// Creates a unary operator applied to one argument in [fnotation].
pub fn unop<'a>(op: D<'a>, arg: D<'a>) -> D<'a> {
    (op + s() + arg).group()
}

/// Creates a binary operator applied to two arguments.
pub fn binop<'a>(op: D<'a>, l: D<'a>, r: D<'a>) -> D<'a> {
    ((l + s() + op).group() + (s() + r).indented()).group()
}

/// Creates a tuple in [fnotation]: (`[x, y, z, ...]`).
pub fn tuple<'a, I: IntoIterator<Item = D<'a>>>(i: I) -> D<'a> {
    D(RcDoc::intersperse(i.into_iter().map(|d| d.0.group()), (t(",") + s()).0))
        .brackets()
        .group()
}

/// Intersperses documents with the given separator.
pub fn intersperse<'a, I: IntoIterator<Item = D<'a>>>(i: I, sep: D<'a>) -> D<'a> {
    D(RcDoc::intersperse(i.into_iter().map(|d| d.0), sep.0))
}

impl<'a> D<'a> {
    /// Try to lay out this document as a group; either on one line or uniformly split.
    pub fn group(self) -> D<'a> {
        D(self.0.group())
    }

    /// Surround this document with parentheses.
    pub fn parens(self) -> D<'a> {
        t("(") + self.group() + t(")")
    }

    /// Increase the indentation level.
    pub fn indented(self) -> Self {
        D(self.0.nest(2))
    }

    /// Surround this document with brackets.
    pub fn brackets(self) -> D<'a> {
        t("[") + self.indented() + t("]")
    }

    /// Use this to print a document.
    pub fn pretty(&self) -> impl fmt::Display {
        self.0.pretty(80)
    }
}
