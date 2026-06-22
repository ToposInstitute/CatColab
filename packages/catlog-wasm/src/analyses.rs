//! Auxiliary structs and glue code for data passed to/from analyses.

use catlog::latex::LatexEquations;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::simulate::ode::PolynomialSystem;
use catlog::stdlib::analyses::ode::{
    self, ODESemantics, ODESemanticsAnalysis, ODESemanticsProblemData, Parameter,
};
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

/// Generates the PolynomialSystem for the systems of polynomial ODEs.
pub(crate) fn polynomial_ode_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<QualifiedName>, i8>, String> {
    let realised_model = model.modal_nonunital()?;
    let analysis = ode::PolynomialODEAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

// // TODO: This enum should already be defined somewhere else...
// enum Doctrine {
//     Discrete,
//     Tabulated,
//     ModalUnital,
//     ModalNonUnital,
// }

// // TODO: can all of the following be generalised by iterating (with a macro) over all the implementations
// //       of ODESemantics? use e.g. `<T as ODESemantics>::ODEParameter`
// //
// //       ... OR just define `fn polynomial_system<S: ODESemantics>` ??????????
//
// fn ode_semantics_system<S: ODESemantics>(
//     model: &DblModel,
//     doctrine: Doctrine,
// ) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<S::ParameterType>, i8>, String> {
//     match doctrine {
//         Doctrine::Discrete => {
//             let realised_model = model.discrete()?;
//             let analysis = <S::AnalysisType>::default();
//             Ok(analysis.build_system(realised_model))
//         }
//         Doctrine::Tabulated => {
//             let realised_model = model.discrete_tab()?;
//             let analysis = S::AnalysisType::default();
//             Ok(analysis.build_system(realised_model))
//         }
//         Doctrine::ModalUnital => {
//             let realised_model = model.modal_unital()?;
//             let analysis = S::AnalysisType::default();
//             Ok(analysis.build_system(realised_model))
//         }
//         Doctrine::ModalNonUnital => {
//             let realised_model = model.modal_nonunital()?;
//             let analysis = S::AnalysisType::default();
//             Ok(analysis.build_system(realised_model))
//         }
//     }
// }

/// Generates the PolynomialSystem for Lotka-Volterra dynamics.
pub(crate) fn lotka_volterra_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::LotkaVolterraParameter>, i8>, String>
{
    let realised_model = model.discrete()?;
    let analysis = ode::LotkaVolterraAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

/// Generates the PolynomialSystem for LCC dynamics.
pub(crate) fn linear_ode_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::LCCParameter>, i8>, String> {
    let realised_model = model.discrete()?;
    let analysis = ode::LCCAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

// TODO: you should be able to REMOVE this enum
/// Mass-action analysis is currently implemented for Petri nets and stock-flow diagrams
/// and we can avoid some code reduplication by making this explicit.
#[derive(Copy, Clone)]
pub(crate) enum MassActionAnalysisLogic {
    /// The modal theory of Petri nets.
    PetriNet,
    /// The discrete tabulator theory of stock-flow diagrams.
    StockFlow,
}

/// Generates the PolynomialSystem for mass-action dynamics.
pub(crate) fn mass_action_system(
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

/// TODO: documentation.
// TODO: rewrite this to use ode_semantics_system, so that there's no need to preface with e.g.
//          let system = lotka_volterra_system(model);
//       in theories.rs
pub(crate) fn ode_semantics_simulation<S: ODESemantics>(
    model: &DblModel,
    problem_data: S::ProblemDataType,
    system: PolynomialSystem<QualifiedName, Parameter<S::ParameterType>, i8>,
) -> Result<ODEResultWithEquations, String> {
    let sys_extended_scalars = problem_data.extend_scalars(system);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_names(model)).to_latex_equations();
    let analysis = problem_data.build_analysis(sys_extended_scalars);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations,
    })
}

/// TODO: documentation.
// TODO: rewrite this to use ode_semantics_system, so that there's no need to preface with e.g.
//          let system = lotka_volterra_system(model);
//       in theories.rs
pub(crate) fn ode_semantics_equations<S: ODESemantics>(
    model: &DblModel,
    system: PolynomialSystem<QualifiedName, Parameter<S::ParameterType>, i8>,
) -> Result<LatexEquations, String> {
    Ok(system.to_latex_equations_with_map(|param| latex_names(model)(param)))
}

// TODO: replace this with ode_semantics_simulation by implementing ODESemantics for polynomial_ode ???
/// Simulates polynomial ODE equations.
pub(crate) fn polynomial_ode_simulation(
    model: &DblModel,
    problem_data: ode::PolynomialODEProblemData,
) -> Result<ODEResultWithEquations, String> {
    let system = polynomial_ode_system(model);
    let sys_extended_scalars = ode::extend_polynomial_ode_scalars(system?, &problem_data);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_names(model)).to_latex_equations();
    let analysis = ode::polynomial_ode_analysis(sys_extended_scalars, problem_data);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations,
    })
}

// TODO: replace this with ode_semantics_equations by implementing ODESemantics for polynomial_ode ???
/// Generates equations for the system of polynomial ODEs.
pub(crate) fn polynomial_ode_equations(model: &DblModel) -> Result<LatexEquations, String> {
    let system = polynomial_ode_system(model);
    let equations = system?.to_latex_equations_with_map(|param| latex_names(model)(param));
    Ok(equations)
}
