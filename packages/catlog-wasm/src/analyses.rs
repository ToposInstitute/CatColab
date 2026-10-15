//! Auxiliary structs and glue code for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::simulate::ode::{LatexEquation, PolynomialSystem};
use catlog::stdlib::analyses::ode::{
    self, ODESemantics, ODESemanticsProblemData, ODESemanticsScalarExtension, Parameter,
};
use catlog::zero::QualifiedName;

use super::latex::{LatexEquations, latex_mor_names_mass_action, latex_ob_names};
use super::model::DblModel;
use super::result::JsResult;

/// The result of an ODE analysis, containing the solution when successful.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResult(pub JsResult<ode::ODESolution, String>);

/// The result of an ODE analysis including equations in LaTeX with substitutions.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResultWithEquations {
    /// The result of the simulation.
    pub solution: ODEResult,
    /// The equations in LaTeX format with parameters substituted.
    #[serde(rename = "latexEquations")]
    pub latex_equations: Vec<LatexEquation>,
}

/// Simulate specific ODE semantics on a model, for use in a simulation analysis.
pub(crate) fn ode_semantics_simulation<S: ODESemantics, P: ODESemanticsProblemData<S>>(
    model: &DblModel,
    problem_data: P,
    system: PolynomialSystem<QualifiedName, Parameter<S::ParameterType>, i8>,
) -> Result<ODEResultWithEquations, String> {
    let sys_extended_scalars = problem_data.clone().parameter_data().extend_scalars(system);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_ob_names(model)).to_latex_equations();
    let analysis = problem_data.general_data().build_analysis(sys_extended_scalars);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations,
    })
}

/// This type is simply to accommodate for analyses that require no input data. This is because
/// `initialContent` for `ModelAnalysisMeta<T>` in `frontend/src/stdlib/analyses.tsx` really needs to
/// be an entire JavaScript object, so we can't simply work with `ModelAnalysisMeta<null>`
/// and set `initialContent: () => null`.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct NullWrapper {
    /// Trivial data.
    pub content: (),
}
