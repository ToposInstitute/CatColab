//! Compilation and evaluation for simple mathematical expressions

mod check;
mod eval;
mod lexer;
mod parser;
mod pprint;
mod span;
mod syntax;
mod token;

pub use check::{compile, Context, Prog};
pub use eval::{eval, Env};
