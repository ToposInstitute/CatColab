//! Model type theory. TODO.
mod binary_signature;
mod composite;
mod display_helpers;
mod hole;

mod ast;
pub mod checker;
mod parser;
pub mod theory;

/// Parse and check a model from source text.
pub fn check(input: &str) -> Result<(), String> {
    let model = parser::parse_model(input).map_err(|e| format!("parse: {e}"))?;
    let programme = ast::Programme { models: vec![model] };
    checker::check_programme(&programme)
        .map(|_| ())
        .map_err(|e| format!("check: {e}"))
}

#[cfg(test)]
mod test_models;
