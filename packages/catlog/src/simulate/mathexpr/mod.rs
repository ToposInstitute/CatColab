//! Compilation and evaluation for simple mathematical expressions

mod compiler;
mod error;
mod eval;
mod lexer;
mod parser;
mod pprint;
mod span;
mod syntax;
mod token;

pub use compiler::{compile, Context, Prog};
pub use error::{Description, Error, Errors};
pub use eval::{run, Env, VecEnv};
pub use pprint::WithSource;
