//! Auxiliary structs and glue code for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::latex::{Latex, LatexEquations, ToLatexEquations};
use catlog::simulate::ode::PolynomialSystem;
use catlog::stdlib::analyses::ode::{self, Parameter};
use catlog::zero::QualifiedName;

use crate::latex::RenderPolynomial;

use super::latex::{latex_mor_names_mass_action, latex_ob_names_mass_action};
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

/// The mass-action analysis is currently implemented for Petri nets and stock-flow
/// diagrams, and we can avoid some code reduplication by making this explicit.
pub enum MassActionAnalysisLogic {
    /// The modal theory of Petri nets.
    PetriNet,
    /// The discrete tabulator theory of stock-flow diagrams.
    StockFlow,
}

/// The analysis data for mass-action equations.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MassActionEquationsData {
    /// The mass-conservation type.
    #[serde(rename = "massConservationType")]
    pub mass_conservation_type: ode::MassConservationType,
}

impl RenderPolynomial for MassActionEquationsData {
    fn render_variable(&self, model: DblModel) -> impl Fn(&QualifiedName) -> Latex {
        move |id: &QualifiedName| {
            let name = model.ob_namespace.label_string(id);
            if name.chars().count() > 1 {
                Latex("\\text{{{name}}}".to_string())
            } else {
                Latex(name)
            }
        }
    }
    
    fn render_coefficient<Coef>(&self, model: DblModel) -> impl Fn(Coef) -> Latex {
        // Returns a LaTeX fragment for a transition, suitable for use as a subscript.
        // Named morphisms produce `\text{name}`, unnamed ones produce
        // `\text{dom} \to \text{cod}` so that `\to` is in math mode.
        let transition_subscript = |transition: &QualifiedName| -> String {
            if let Some(label) = model.mor_namespace.label(transition) {
                format!("\\text{{{label}}}")
            } else {
                let (dom, cod) = model
                    .mor_generator_dom_cod_label_strings(transition)
                    .expect("Morphism in equation system should have domain and codomain");
                format!("\\text{{{dom}}} \\to \\text{{{cod}}}")
            }
        };

        move |id: &ode::FlowParameter| match id {
            ode::FlowParameter::Balanced { transition } => {
                let sub = transition_subscript(transition);
                format!("r_{{{sub}}}")
            }
            ode::FlowParameter::Unbalanced { direction, parameter } => match (direction, parameter) {
                (ode::Direction::IncomingFlow, ode::RateParameter::PerTransition { transition }) => {
                    let sub = transition_subscript(transition);
                    format!("\\rho_{{{sub}}}")
                }
                (ode::Direction::OutgoingFlow, ode::RateParameter::PerTransition { transition }) => {
                    let sub = transition_subscript(transition);
                    format!("\\kappa_{{{sub}}}")
                }
                (ode::Direction::IncomingFlow, ode::RateParameter::PerPlace { transition, place }) => {
                    let sub = transition_subscript(transition);
                    let output_place_label = model.ob_namespace.label_string(place);
                    format!("\\rho_{{{sub}}}^{{\\text{{{output_place_label}}}}}")
                }
                (ode::Direction::OutgoingFlow, ode::RateParameter::PerPlace { transition, place }) => {
                    let sub = transition_subscript(transition);
                    let input_place_label = model.ob_namespace.label_string(place);
                    format!("\\kappa_{{{sub}}}^{{\\text{{{input_place_label}}}}}")
                }
            },
        }
    }
}

/// Generates the PolynomialSystem for mass-action dynamics.
fn mass_action_system(
    model: &DblModel,
    mass_conservation_type: ode::MassConservationType,
    logic: MassActionAnalysisLogic,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::FlowParameter>, i8>, String> {
    match logic {
        MassActionAnalysisLogic::PetriNet => {
            let realised_model = model.modal()?;
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

/// Simulates mass-action ODEs.
pub(crate) fn mass_action_simulation(
    model: &DblModel,
    data: ode::MassActionProblemData,
    logic: MassActionAnalysisLogic,
) -> Result<ODEResultWithEquations, String> {
    let sys = mass_action_system(model, data.mass_conservation_type, logic);
    let sys_extended_scalars = ode::extend_mass_action_scalars(sys?, &data);
    let latex_equations = sys_extended_scalars
        .map_variables(latex_ob_names_mass_action(model))
        .to_latex_equations();
    let analysis = ode::into_mass_action_analysis(sys_extended_scalars, data);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations: latex_equations,
    })
}

/// Generates mass-action equations for the equations.
pub(crate) fn mass_action_equations(
    model: &DblModel,
    data: MassActionEquationsData,
    logic: MassActionAnalysisLogic,
) -> Result<LatexEquations, String> {
    let sys = mass_action_system(model, data.mass_conservation_type, logic);
    let equations = sys?
        .map_variables(data.render_variable(model))
        .extend_scalars(|param| param.map_variables(data.render_coefficient(model)))
        .to_latex_equations();
    Ok(equations)
}
