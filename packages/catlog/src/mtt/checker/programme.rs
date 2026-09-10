//! TODO.

use crate::mtt::ast::{Model, Programme};
use crate::mtt::checker::context::{ModelEntry, ProgrammeContext};
use crate::mtt::checker::error::{CheckResult, Error};
use crate::mtt::theory::{
    CartesianMulticategory, Category, Multicategory, Schema, SymmetricMulticategory, Theory,
};

impl ProgrammeContext {
    /// Check an entire programme, model by model, in declaration order.
    pub fn check_programme_ast(&mut self, programme_ast: &Programme) -> CheckResult {
        for model in &programme_ast.models {
            self.check_model(model)?;
        }
        Ok(())
    }

    /// Check a model against the theory it names, dispatching on the theory's
    /// string identifier, and add the resulting checked model to the programme.
    /// This is the bridge between the theory-erased AST and the
    /// theory-parametric checker: it instantiates a fresh `ModelEntry` over the
    /// concrete theory and runs the checker. To add a theory, give it a
    /// [Theory] implementation and add an arm here keyed on [`Theory::NAME`].
    fn check_model(&mut self, model: &Model) -> CheckResult {
        match model.theory.as_str() {
            Category::NAME => self.check_model_over::<Category>(model),
            Schema::NAME => self.check_model_over::<Schema>(model),
            Multicategory::NAME => self.check_model_over::<Multicategory>(model),
            SymmetricMulticategory::NAME => self.check_model_over::<SymmetricMulticategory>(model),
            CartesianMulticategory::NAME => self.check_model_over::<CartesianMulticategory>(model),
            other => Err(Error::UnknownTheory(other.to_string())),
        }
    }

    /// Check a single model over a fixed, statically known theory.
    fn check_model_over<T: Theory>(&mut self, model: &Model) -> CheckResult {
        let mut entry = ModelEntry::<T>::new();
        entry.check_model_ast(model, self)?;
        self.add_model(&model.name, entry)?;
        Ok(())
    }
}

/// Check an entire programme, returning its accumulated checker context.
pub fn check_programme(programme_ast: &Programme) -> Result<ProgrammeContext, Error> {
    let mut programme_context = ProgrammeContext::default();
    programme_context.check_programme_ast(programme_ast)?;
    Ok(programme_context)
}
