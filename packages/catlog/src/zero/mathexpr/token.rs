use super::span::Span;
use std::fmt;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    LParen,
    RParen,
    Ident,
    Decimal,
    Plus,
    Times,
    Minus,
    Slash,
    Error,
    Eof,
}

pub(super) use Kind::*;

pub(super) struct Token {
    pub kind: Kind,
    pub span: Span,
}

impl Token {
    pub fn new(kind: Kind, span: Span) -> Self {
        Self { kind, span }
    }
}

impl fmt::Display for Token {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        write!(f, "{:?}:{}", self.kind, self.span.len())
    }
}
