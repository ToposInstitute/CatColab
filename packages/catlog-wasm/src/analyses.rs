//! Auxiliary structs and glue code for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use super::result::JsResult;
use catlog::simulate::ode::LatexEquation;
use catlog::stdlib::analyses;
use catlog::stdlib::analyses::ode::{Direction, FlowParameter, ODESolution, RateParameter};
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
        let name = model.ob_namespace.label_string(id);
        if name.chars().count() > 1 {
            format!("\\text{{{name}}}")
        } else {
            name
        }
    }
}

/// Creates a closure that formats morphism names for mass-action LaTeX output.
pub(crate) fn latex_mor_names_mass_action(model: &DblModel) -> impl Fn(&FlowParameter) -> String {
    |id: &FlowParameter| match id {
        FlowParameter::Balanced { transition } => {
            let transition_label = model.mor_namespace.label_string(transition);
            format!("r_{{\\text{{{transition_label}}}}}")
        }
        FlowParameter::Unbalanced { direction, parameter } => match (direction, parameter) {
            (Direction::IncomingFlow, RateParameter::PerTransition { transition }) => {
                let transition_label = model.mor_namespace.label_string(transition);
                format!("\\rho_{{\\text{{{transition_label}}}}}")
            }
            (Direction::OutgoingFlow, RateParameter::PerTransition { transition }) => {
                let transition_label = model.mor_namespace.label_string(transition);
                format!("\\kappa_{{\\text{{{transition_label}}}}}")
            }
            (Direction::IncomingFlow, RateParameter::PerPlace { transition, place }) => {
                let transition_label = model.mor_namespace.label_string(transition);
                let output_place_label = model.ob_namespace.label_string(place);
                format!("\\rho_{{\\text{{{transition_label}}}}}^{{\\text{{{output_place_label}}}}}")
            }
            (Direction::OutgoingFlow, RateParameter::PerPlace { transition, place }) => {
                let transition_label = model.mor_namespace.label_string(transition);
                let input_place_label = model.ob_namespace.label_string(place);
                format!("\\rho_{{\\text{{{transition_label}}}}}^{{\\text{{{input_place_label}}}}}")
            }
        },
    }
}

/// Simulates mass-action ODE on tabulated models.
pub(crate) fn mass_action_tab(
    model: &DblModel,
    data: analyses::ode::MassActionProblemData,
) -> Result<ODEResultWithEquations, String> {
    let realised_model = model.discrete_tab()?;
    let analysis = analyses::ode::StockFlowMassActionAnalysis::default();
    let sys = analysis.build_system(realised_model, data.mass_conservation_type);
    let sys_extended_scalars = analyses::ode::extend_mass_action_scalars(sys, &data);
    let latex_equations = sys_extended_scalars
        .map_variables(latex_ob_names_mass_action(model))
        .to_latex_equations();
    let analysis = analyses::ode::into_mass_action_analysis(sys_extended_scalars, data);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: solution.into(),
        latex_equations,
    })
}

/// Simulates mass-action ODE on modal models.
pub(crate) fn mass_action_modal(
    model: &DblModel,
    data: analyses::ode::MassActionProblemData,
) -> Result<ODEResultWithEquations, String> {
    let realised_model = model.modal()?;
    let analysis = analyses::ode::PetriNetMassActionAnalysis::default();
    let sys = analysis.build_system(realised_model, data.mass_conservation_type);
    let sys_extended_scalars = analyses::ode::extend_mass_action_scalars(sys, &data);
    let latex_equations = sys_extended_scalars
        .map_variables(latex_ob_names_mass_action(model))
        .to_latex_equations();
    let analysis = analyses::ode::into_mass_action_analysis(sys_extended_scalars, data);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: solution.into(),
        latex_equations,
    })
}

/// Generates mass-action equations for tabulated models.
pub(crate) fn mass_action_equations_tab(
    model: &DblModel,
    mass_conservation_type: analyses::ode::MassConservationType,
) -> Result<ODELatex, String> {
    let realised_model = model.discrete_tab()?;
    let analysis = analyses::ode::StockFlowMassActionAnalysis::default();
    let sys = analysis.build_system(realised_model, mass_conservation_type);
    let equations = sys
        .map_variables(latex_ob_names_mass_action(model))
        .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(model)))
        .to_latex_equations();
    Ok(ODELatex(equations))
}

/// Generates mass-action equations for modal models.
pub(crate) fn mass_action_equations_modal(
    model: &DblModel,
    mass_conservation_type: analyses::ode::MassConservationType,
) -> Result<ODELatex, String> {
    let realised_model = model.modal()?;
    let analysis = analyses::ode::PetriNetMassActionAnalysis::default();
    let sys = analysis.build_system(realised_model, mass_conservation_type);
    let equations = sys
        .map_variables(latex_ob_names_mass_action(model))
        .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(model)))
        .to_latex_equations();
    Ok(ODELatex(equations))
}

#[cfg(test)]
mod tests {
    use catlog::simulate::ode::LatexEquation;
    use catlog::stdlib::analyses::ode;

    use super::*;
    use crate::model::tests::backward_link;

    #[test]
    fn unbalanced_mass_action_latex_equations() {
        let model = backward_link("xxx", "yyy", "fff");
        let tab_model = model.discrete_tab().unwrap();
        let analysis = ode::StockFlowMassActionAnalysis::default();
        let sys = analysis.build_system(
            tab_model,
            ode::MassConservationType::Unbalanced(ode::RateGranularity::PerTransition),
        );
        let equations = sys
            .map_variables(latex_ob_names_mass_action(&model))
            .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(&model)))
            .to_latex_equations();

        let expected = vec![
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{xxx}".to_string(),
                rhs: "(-\\kappa_{\\text{fff}}) \\text{xxx} \\text{yyy}".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{yyy}".to_string(),
                rhs: "(\\rho_{\\text{fff}}) \\text{xxx} \\text{yyy}".to_string(),
            },
        ];
        assert_eq!(equations, expected);
    }
}
