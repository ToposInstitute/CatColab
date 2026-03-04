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
///
/// When a morphism has a label, it is used directly. When unnamed, the label
/// falls back to the domain→codomain format (e.g., `X \to Y`).
pub(crate) fn latex_mor_names_mass_action(model: &DblModel) -> impl Fn(&FlowParameter) -> String {
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

    move |id: &FlowParameter| match id {
        FlowParameter::Balanced { transition } => {
            let sub = transition_subscript(transition);
            format!("r_{{{sub}}}")
        }
        FlowParameter::Unbalanced { direction, parameter } => match (direction, parameter) {
            (Direction::IncomingFlow, RateParameter::PerTransition { transition }) => {
                let sub = transition_subscript(transition);
                format!("\\rho_{{{sub}}}")
            }
            (Direction::OutgoingFlow, RateParameter::PerTransition { transition }) => {
                let sub = transition_subscript(transition);
                format!("\\kappa_{{{sub}}}")
            }
            (Direction::IncomingFlow, RateParameter::PerPlace { transition, place }) => {
                let sub = transition_subscript(transition);
                let output_place_label = model.ob_namespace.label_string(place);
                format!("\\rho_{{{sub}}}^{{\\text{{{output_place_label}}}}}")
            }
            (Direction::OutgoingFlow, RateParameter::PerPlace { transition, place }) => {
                let sub = transition_subscript(transition);
                let input_place_label = model.ob_namespace.label_string(place);
                format!("\\rho_{{{sub}}}^{{\\text{{{input_place_label}}}}}")
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

/// The analysis data for mass-action equations.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MassActionEquationsData {
    /// The mass-conservation type.
    #[serde(rename = "massConservationType")]
    pub mass_conservation_type: analyses::ode::MassConservationType,
}

/// Generates mass-action equations for tabulated models.
pub(crate) fn mass_action_equations_tab(
    model: &DblModel,
    data: MassActionEquationsData,
) -> Result<ODELatex, String> {
    let realised_model = model.discrete_tab()?;
    let analysis = analyses::ode::StockFlowMassActionAnalysis::default();
    let sys = analysis.build_system(realised_model, data.mass_conservation_type);
    let equations = sys
        .map_variables(latex_ob_names_mass_action(model))
        .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(model)))
        .to_latex_equations();
    Ok(ODELatex(equations))
}

/// Generates mass-action equations for modal models.
pub(crate) fn mass_action_equations_modal(
    model: &DblModel,
    data: MassActionEquationsData,
) -> Result<ODELatex, String> {
    let realised_model = model.modal()?;
    let analysis = analyses::ode::PetriNetMassActionAnalysis::default();
    let sys = analysis.build_system(realised_model, data.mass_conservation_type);
    let equations = sys
        .map_variables(latex_ob_names_mass_action(model))
        .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(model)))
        .to_latex_equations();
    Ok(ODELatex(equations))
}

#[cfg(test)]
mod tests {
    use catlog::dbl::modal::{List, ModalMorType, ModalOb, ModalObType};
    use catlog::dbl::model::{ModalDblModel, MutDblModel};
    use catlog::simulate::ode::LatexEquation;
    use catlog::stdlib::{analyses::ode, theories};
    use catlog::zero::{LabelSegment, Namespace, QualifiedName};
    use std::rc::Rc;
    use uuid::Uuid;

    use super::*;
    use crate::model::{DblModel, tests::backward_link};

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

    #[test]
    fn unnamed_mor_uses_dom_cod_in_equations() {
        let model = backward_link("xxx", "yyy", "");
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
                rhs: "(-\\kappa_{\\text{xxx} \\to \\text{yyy}}) \\text{xxx} \\text{yyy}"
                    .to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{yyy}".to_string(),
                rhs: "(\\rho_{\\text{xxx} \\to \\text{yyy}}) \\text{xxx} \\text{yyy}".to_string(),
            },
        ];
        assert_eq!(equations, expected);
    }

    #[test]
    fn modal_mor_dom_cod_labels() {
        let th = Rc::new(theories::th_sym_monoidal_category());
        let ob_type = ModalObType::new(QualifiedName::from("Object"));
        let op = QualifiedName::from("tensor");

        let [s_id, i_id, r_id] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];
        let [infect_id, recover_id] = [Uuid::now_v7(), Uuid::now_v7()];

        let mut inner = ModalDblModel::new(th);
        inner.add_ob(s_id.into(), ob_type.clone());
        inner.add_ob(i_id.into(), ob_type.clone());
        inner.add_ob(r_id.into(), ob_type.clone());

        // infect: tensor(S, I) -> tensor(I, I) — product-typed dom and cod.
        inner.add_mor(
            infect_id.into(),
            ModalOb::App(
                ModalOb::List(
                    List::Symmetric,
                    vec![ModalOb::Generator(s_id.into()), ModalOb::Generator(i_id.into())],
                )
                .into(),
                op.clone(),
            ),
            ModalOb::App(
                ModalOb::List(
                    List::Symmetric,
                    vec![ModalOb::Generator(i_id.into()), ModalOb::Generator(i_id.into())],
                )
                .into(),
                op.clone(),
            ),
            ModalMorType::Zero(ob_type.clone()),
        );

        // recover: I -> R — simple generator dom and cod.
        inner.add_mor(
            recover_id.into(),
            ModalOb::Generator(i_id.into()),
            ModalOb::Generator(r_id.into()),
            ModalMorType::Zero(ob_type),
        );

        let mut ob_namespace = Namespace::new_for_uuid();
        ob_namespace.set_label(s_id, LabelSegment::Text("S".into()));
        ob_namespace.set_label(i_id, LabelSegment::Text("I".into()));
        ob_namespace.set_label(r_id, LabelSegment::Text("R".into()));

        let model = DblModel {
            model: inner.into(),
            ty: None,
            ob_namespace,
            mor_namespace: Namespace::new_for_uuid(),
        };

        // Morphism with basic generator dom/cod resolves labels.
        assert_eq!(
            model.mor_generator_dom_cod_label_strings(&recover_id.into()),
            Some(("I".to_string(), "R".to_string()))
        );

        // Morphism with product-typed dom/cod resolves to bracketed labels.
        assert_eq!(
            model.mor_generator_dom_cod_label_strings(&infect_id.into()),
            Some(("[S, I]".to_string(), "[I, I]".to_string()))
        );
    }
}
