use std::fmt::Display;

use ustr::Ustr;

use super::pprint::{DisplayWithSource, WithSource};
use super::span::Span;
use super::token;

#[derive(Debug)]
/// An error generated from compiling a mathexpr
/// This could be a lex error, parse error, name resolution error, etc.
/// We keep it simple, and just associate each error with one source
/// code location. This can be printed out, using the span printing algorithm
/// in span.rs, or in the future could be highlighted in an editor
pub struct Error {
    /// The span at which the error occured
    pub span: Span,
    /// A description of the error
    pub description: Description,
}

impl DisplayWithSource for Error {
    fn fmt(&self, src: &str, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        writeln!(f, "{}", &self.description)?;
        writeln!(f)?;
        write!(f, "{}", WithSource::new(src, &self.span))
    }
}

#[derive(Debug)]
/// A list of errors. We wrap this so that we can give a custom implementation of DisplayWithSource
pub struct Errors(pub Vec<Error>);

impl DisplayWithSource for Errors {
    fn fmt(&self, src: &str, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        for e in self.0.iter() {
            writeln!(f, "{}", WithSource::new(src, e))?;
        }
        Ok(())
    }
}

#[derive(Debug)]
/// An error description. We use an enum rather than a string because we might want to display
/// this in different ways at some point, but it can be converted to string via Display.
pub enum Description {
    /// Unexpected start of token character while lexing
    UnexpectedStartOfToken,
    /// Unexpected token while parsing
    UnexpectedToken {
        /// The token we got
        got: token::Kind,
        /// The token we were expecting
        expecting: token::Kind,
    },
    /// Other parse error
    ParseError {
        /// The error message
        message: String,
    },
    /// Name resolution error
    NameNotFound {
        /// The name that couldn't be resolved
        name: Ustr,
    },
}

impl Display for Description {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnexpectedStartOfToken => write!(f, "lex error: unexpected start of token"),
            Self::UnexpectedToken { got, expecting } => {
                write!(f, "parse error: unexpected token {:?}, expecting {:?}", got, expecting)
            }
            Self::ParseError { message } => {
                write!(f, "parse error: {}", message)
            }
            Self::NameNotFound { name } => {
                write!(f, "compile error: name not found {}", name.as_str())
            }
        }
    }
}
