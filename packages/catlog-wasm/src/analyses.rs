//! Auxiliary structs and glue code for data passed to/from analyses.

use catlog::latex::LatexEquations;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::simulate::ode::PolynomialSystem;
use catlog::stdlib::analyses::ode::{self, ODESemanticsAnalysis, ODESemanticsProblemData};
use catlog::zero::QualifiedName;

use crate::latex::latex_names;

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
    let realised_model = model.modal_nonunital()?;
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
        .to_latex_equations_with_map(|param| latex_names(&model)(param));
    Ok(equations)
}

/// Simulates mass-action ODEs.
pub(crate) fn polynomial_ode_simulation(
    model: &DblModel,
    data: ode::PolynomialODEProblemData,
) -> Result<ODEResultWithEquations, String> {
    let sys = polynomial_ode_system(model);
    let sys_extended_scalars = ode::extend_polynomial_ode_scalars(sys?, &data);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_names(model)).to_latex_equations();
    let analysis = ode::polynomial_ode_analysis(sys_extended_scalars, data);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations,
    })
}

/// Mass-action analysis is currently implemented for Petri nets and stock-flow diagrams
/// and we can avoid some code reduplication by making this explicit.
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
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::MassActionParameter>, i8>, String> {
    match logic {
        MassActionAnalysisLogic::PetriNet => {
            let realised_model = model.modal_unital()?;
            let analysis = ode::PetriNetMassActionAnalysis {
                mass_conservation_type,
                ..ode::PetriNetMassActionAnalysis::default()
            };
            Ok(analysis.build_system(realised_model))
        }
        MassActionAnalysisLogic::StockFlow => {
            let realised_model = model.discrete_tab()?;
            let analysis = ode::StockFlowMassActionAnalysis {
                mass_conservation_type,
                ..ode::StockFlowMassActionAnalysis::default()
            };
            Ok(analysis.build_system(realised_model))
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
        .to_latex_equations_with_map(|param| latex_names(&model)(param));
    Ok(equations)
}

/// Simulates mass-action ODEs.
pub(crate) fn mass_action_simulation(
    model: &DblModel,
    data: ode::MassActionProblemData,
    logic: MassActionAnalysisLogic,
) -> Result<ODEResultWithEquations, String> {
    let sys = mass_action_system(model, data.mass_conservation_type, logic);
    let sys_extended_scalars = data.extend_scalars(sys?);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_names(model)).to_latex_equations();
    let analysis = data.build_analysis(sys_extended_scalars);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations,
    })
}

/// Generates the PolynomialSystem for Lotka-Volterra dynamics.
fn lotka_volterra_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::LotkaVolterraParameter>, i8>, String>
{
    let realised_model = model.discrete()?;
    let analysis = ode::LotkaVolterraAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

/// The analysis data for polynomial ODE equations.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LotkaVolterraEquationsData {
    #[serde(rename = "trivialData")]
    trivial_data: bool,
}

/// Generates Lotka-Volterra equations for the system.
pub(crate) fn lotka_volterra_equations(model: &DblModel) -> Result<LatexEquations, String> {
    let sys = lotka_volterra_system(model);
    let equations = sys?
        .to_latex_equations_with_map(|param| latex_names(&model)(param));
    Ok(equations)
}

/// Simulates Lotka-Volterra ODEs.
pub(crate) fn lotka_volterra_simulation(
    model: &DblModel,
    data: ode::LotkaVolterraProblemData,
) -> Result<ODEResultWithEquations, String> {
    let sys = lotka_volterra_system(model);
    let sys_extended_scalars = data.extend_scalars(sys?);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_names(model)).to_latex_equations();
    let analysis = data.build_analysis(sys_extended_scalars);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations,
    })
}

/// Generates the PolynomialSystem for linear ODE dynamics.
fn linear_ode_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::LCCParameter>, i8>, String> {
    let realised_model = model.discrete()?;
    let analysis = ode::LCCAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

/// The analysis data for polynomial ODE equations.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LCCEquationsData {
    #[serde(rename = "trivialData")]
    trivial_data: bool,
}

/// Generates linear ODE equations for the system.
pub(crate) fn linear_ode_equations(model: &DblModel) -> Result<LatexEquations, String> {
    let sys = linear_ode_system(model);
    let equations = sys?
        .to_latex_equations_with_map(|param| latex_names(&model)(param));
    Ok(equations)
}

/// Simulates linear ODE equations.
pub(crate) fn linear_ode_simulation(
    model: &DblModel,
    data: ode::LCCProblemData,
) -> Result<ODEResultWithEquations, String> {
    let sys = linear_ode_system(model);
    let sys_extended_scalars = data.extend_scalars(sys?);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_names(model)).to_latex_equations();
    let analysis = data.build_analysis(sys_extended_scalars);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations,
    })
}
