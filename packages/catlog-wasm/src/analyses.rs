//! Auxiliary structs and LaTeX utilities for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use super::result::JsResult;
use catlog::simulate::ode::LatexEquation;
use catlog::stdlib::analyses::ode::{Direction, ODESolution, RateParameter, Term};
use catlog::zero::QualifiedName;

use super::model::DblModel;

/// The result of an ODE analysis, containing the solution when successful.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResult(pub JsResult<ODESolution, String>);

/// The result of an ODE analysis including equations in LaTex with substitutions.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResultWithEquations {
    /// The result of the simulation.
    pub solution: JsResult<ODESolution, String>,
    /// The equations in LaTeX format with parameters substituted.
    #[serde(rename = "latexEquations")]
    pub latex_equations: Vec<LatexEquation>,
}

/// Symbolic equations in LaTeX format.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODELatex(pub Vec<LatexEquation>);

/// Creates a closure that formats object names for LaTeX output.
pub(crate) fn latex_ob_names_mass_action(model: &DblModel) -> impl Fn(&QualifiedName) -> String {
    |id: &QualifiedName| {
        let name = model
            .ob_generator_label(id)
            .map_or_else(|| id.to_string(), |label| label.to_string());

        if name.chars().count() > 1 {
            format!("\\text{{{name}}}")
        } else {
            name
        }
    }
}

/// Creates a closure that formats morphism names for mass-action LaTeX output.
pub(crate) fn latex_mor_names_mass_action(model: &DblModel) -> impl Fn(&Term) -> String {
    |id: &Term| match id {
        Term::UndirectedTerm { transition } => {
            let transition_name = model
                .mor_generator_label(transition)
                .map_or_else(|| transition.to_string(), |label| label.to_string());
            format!("r_{{\\text{{{transition_name}}}}}")
        }
        Term::DirectedTerm { direction, parameter } => match (direction, parameter) {
            (Direction::IncomingFlow, RateParameter::PerTransition { transition }) => {
                let transition_name = model
                    .mor_generator_label(transition)
                    .map_or_else(|| transition.to_string(), |label| label.to_string());
                format!("\\rho_{{\\text{{{transition_name}}}}}")
            }
            (Direction::OutgoingFlow, RateParameter::PerTransition { transition }) => {
                let transition_name = model
                    .mor_generator_label(transition)
                    .map_or_else(|| transition.to_string(), |label| label.to_string());
                format!("\\kappa_{{\\text{{{transition_name}}}}}")
            }
            (Direction::IncomingFlow, RateParameter::PerPlace { transition, place }) => {
                let transition_name = model
                    .mor_generator_label(transition)
                    .map_or_else(|| transition.to_string(), |label| label.to_string());
                let output_place_name = model
                    .ob_generator_label(place)
                    .map_or_else(|| place.to_string(), |label| label.to_string());
                format!("\\rho_{{\\text{{{transition_name}}}}}^{{\\text{{{output_place_name}}}}}")
            }
            (Direction::OutgoingFlow, RateParameter::PerPlace { transition, place }) => {
                let transition_name = model
                    .mor_generator_label(transition)
                    .map_or_else(|| transition.to_string(), |label| label.to_string());
                let input_place_name = model
                    .ob_generator_label(place)
                    .map_or_else(|| place.to_string(), |label| label.to_string());
                format!("\\rho_{{\\text{{{transition_name}}}}}^{{\\text{{{input_place_name}}}}}")
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use catlog::simulate::ode::LatexEquation;
    use catlog::stdlib::analyses::ode::StockFlowMassActionAnalysis;

    use super::*;
    use crate::model::tests::backward_link;

    #[test]
    fn mass_action_latex_equations() {
        let model = backward_link("xxx", "yyy", "fff");
        let tab_model = model.discrete_tab().unwrap();
        let analysis = StockFlowMassActionAnalysis::default();
        let sys = analysis.build_system(tab_model);
        let equations = sys
            .map_variables(latex_ob_names_mass_action(&model))
            .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(&model)))
            .to_latex_equations();

        let expected = vec![
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{xxx}".to_string(),
                rhs: "(-r_{\\text{fff}}) \\text{xxx} \\text{yyy}".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{yyy}".to_string(),
                rhs: "(r_{\\text{fff}}) \\text{xxx} \\text{yyy}".to_string(),
            },
        ];
        assert_eq!(equations, expected);
    }
}
