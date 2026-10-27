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

// TODO: Everything below this point will be deleted in the next PR, when all the other ODE analyses
//       are brought up to v1.

/// The mass-action analysis is currently implemented for Petri nets and stock-flow
/// diagrams, and we can avoid some code reduplication by making this explicit.
pub enum MassActionAnalysisLogic {
    /// The modal theory of Petri nets.
    PetriNet,
    /// The discrete tabulator theory of stock-flow diagrams.
    StockFlow,
}

/// Generates the PolynomialSystem for mass-action dynamics.
fn mass_action_system(
    model: &DblModel,
    mass_conservation_type: ode::MassConservationType,
    logic: MassActionAnalysisLogic,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::FlowParameter>, i8>, String> {
    match logic {
        MassActionAnalysisLogic::PetriNet => {
            let realised_model = model.modal_unital()?;
            let analysis = ode::PetriNetMassActionAnalysis::default();
            Ok(analysis.build_system(realised_model, mass_conservation_type))
        }
        MassActionAnalysisLogic::StockFlow => {
            let realised_model = model.discrete_tab()?;
            let analysis = ode::StockFlowMassActionAnalysis::default();
            Ok(analysis.build_system(realised_model, mass_conservation_type))
        }
    }
}

/// The analysis data for mass-action equations.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MassActionEquationsData {
    /// The mass-conservation type.
    #[serde(rename = "massConservationType")]
    pub mass_conservation_type: ode::MassConservationType,
}

/// Generates mass-action equations for the system.
pub(crate) fn mass_action_equations(
    model: &DblModel,
    data: MassActionEquationsData,
    logic: MassActionAnalysisLogic,
) -> Result<LatexEquations, String> {
    let sys = mass_action_system(model, data.mass_conservation_type, logic);
    let equations = sys?
        .map_variables(latex_ob_names(model))
        .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(model)))
        .to_latex_equations();
    Ok(LatexEquations(equations))
}

/// Simulates mass-action ODEs.
pub(crate) fn mass_action_simulation(
    model: &DblModel,
    data: ode::MassActionProblemData,
    logic: MassActionAnalysisLogic,
) -> Result<ODEResultWithEquations, String> {
    let sys = mass_action_system(model, data.mass_conservation_type, logic);
    let sys_extended_scalars = ode::extend_mass_action_scalars(sys?, &data);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_ob_names(model)).to_latex_equations();
    let analysis = ode::into_mass_action_analysis(sys_extended_scalars, data);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations,
    })
}
