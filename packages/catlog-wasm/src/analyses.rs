//! Auxiliary structs and glue code for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::simulate::ode::PolynomialSystem;
use catlog::stdlib::analyses::ode;
use catlog::zero::QualifiedName;

use super::latex::{LatexEquations, latex_mor_names, latex_mor_names_mass_action, latex_ob_names};
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
    pub latex_equations: LatexEquations,
}

/// The analysis data for polynomial ODE equations.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct PolynomialODEEquationsData {
    #[serde(rename = "trivialData")]
    trivial_data: bool,
}

/// Generates the PolynomialSystem for the systems of polynomial ODEs.
fn polynomial_ode_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<QualifiedName>, i8>, String> {
    let realised_model = model.modal_non_unital()?;
    let analysis = ode::PolynomialODEAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

/// Generates equations for the system of polynomial ODEs.
pub(crate) fn polynomial_ode_equations(
    model: &DblModel,
    _data: PolynomialODEEquationsData,
) -> Result<LatexEquations, String> {
    let sys = polynomial_ode_system(model);
    let equations = sys?
        .map_variables(latex_ob_names(model))
        .extend_scalars(|param| param.map_variables(latex_mor_names(model)))
        .to_latex_equations();
    Ok(LatexEquations(equations))
}

/// Simulates mass-action ODEs.
pub(crate) fn polynomial_ode_simulation(
    model: &DblModel,
    data: ode::PolynomialODEProblemData,
) -> Result<ODEResultWithEquations, String> {
    let sys = polynomial_ode_system(model);
    let sys_extended_scalars = ode::extend_polynomial_ode_scalars(sys?, &data);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_ob_names(model)).to_latex_equations();
    let analysis = ode::polynomial_ode_analysis(sys_extended_scalars, data);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations: LatexEquations(latex_equations),
    })
}

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
        latex_equations: LatexEquations(latex_equations),
    })
}
