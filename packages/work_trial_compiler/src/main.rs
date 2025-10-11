use crate::{ast::Expr, fnotation_parser::FNotationParser};

pub mod ast;
pub mod fnotation_parser;
pub mod typechecker;

pub mod tests;

pub fn parse_and_convert(input: &str) -> Result<Expr, String> {
    let parser = FNotationParser::new();
    let context = parser.create_context(input)?;
    let fntn = parser.parse_to_fnotation(input, &context)?;

    ast::convert(fntn)
}

fn main() {
    // same as run ```cargo test```
    use std::process::Command;

    let output = Command::new("cargo").arg("test").output().expect("Failed to run tests");

    println!("{}", String::from_utf8_lossy(&output.stdout));
}
