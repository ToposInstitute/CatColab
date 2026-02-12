//! Auxiliary structs and LaTeX utilities for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use super::result::JsResult;
use catlog::simulate::ode::LatexEquation;
use catlog::stdlib::analyses::ode::{DirectedTerm, ODESolution};
use catlog::zero::QualifiedName;

use super::model::DblModel;

/// The result of an ODE analysis, containing the solution when successful.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResult(pub JsResult<ODESolution, String>);

/// The result of an ODE analysis including equations in LaTex with subsititutions.
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

/// Creates a closure that formats morphism names for LaTeX output.
pub(crate) fn latex_mor_names_mass_action(model: &DblModel) -> impl Fn(&QualifiedName) -> String {
    |id: &QualifiedName| {
        let name = model
            .mor_generator_label(id)
            .map_or_else(|| id.to_string(), |label| label.to_string());
        format!("r_{{\\text{{{name}}}}}")
    }
}

/// Creates a closure that formats morphism names for unbalanced mass-action LaTeX output.
pub(crate) fn latex_mor_names_unbalanced_mass_action(
    model: &DblModel,
) -> impl Fn(&DirectedTerm) -> String {
    |id: &DirectedTerm| match id {
        DirectedTerm::IncomingFlow(id) => {
            let name = model
                .mor_generator_label(id)
                .map_or_else(|| id.to_string(), |label| label.to_string());
            format!("\\rho_{{\\text{{{name}}}}}")
        }
        DirectedTerm::OutgoingFlow(id) => {
            let name = model
                .mor_generator_label(id)
                .map_or_else(|| id.to_string(), |label| label.to_string());
            format!("\\kappa_{{\\text{{{name}}}}}")
        }
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
