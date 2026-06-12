//! TODO
use crate::mtt::{
    ast::{Model, Program},
    checker::{
        context::ModelEntry,
        error::{CheckResult, Error},
    },
    theory::{Category, Schema, Theory},
};

/// Check a model against the theory it names, dispatching on the theory's
/// string identifier. This is the bridge between the theory-erased AST and the
/// theory-parametric checker: it instantiates a fresh [ModelEntry] over the
/// concrete theory and runs the checker. To add a theory, give it a [Theory]
/// implementation and add an arm here keyed on [Theory::name].
pub fn check_model(model: &Model) -> CheckResult {
    match model.theory.as_str() {
        _ if model.theory == Category::name() => check_model_over::<Category>(model),
        _ if model.theory == Schema::name() => check_model_over::<Schema>(model),
        other => Err(Error::UnknownTheory(other.to_string())),
    }
}

/// Check a single model over a fixed, statically known theory.
fn check_model_over<T: Theory>(model: &Model) -> CheckResult {
    let mut entry = ModelEntry::<T>::new();
    entry.check_model_ast(model)
}

/// Check an entire program, model by model, in declaration order.
pub fn check_program(program: &Program) -> CheckResult {
    // TODO: we'll need a new context for USE statements, right now every model
    // is checked in isolation.
    for model in program.models.iter() {
        check_model(model)?;
    }
    Ok(())
}
