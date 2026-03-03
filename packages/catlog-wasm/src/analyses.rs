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
    use std::rc::Rc;

    use catlog::simulate::ode::LatexEquation;
    use catlog::stdlib::analyses::ode;
    use catlog::stdlib::theories::th_sym_monoidal_category;
    use catlog::zero::Namespace;

    use super::*;
    use crate::model::tests::backward_link;
    use crate::model::{DblModel, DblModelBox};

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
    fn petri_net_unnamed_transition_equations() {
        use catlog::dbl::modal::{List, ModalMorType, ModalOb, ModalObType};
        use catlog::dbl::model::{ModalDblModel, MutDblModel};
        use catlog::zero::LabelSegment;
        use uuid::Uuid;

        // Build a Petri net model with UUID-based names (like real notebooks).
        let th = Rc::new(th_sym_monoidal_category());
        let ob_type = ModalObType::new(QualifiedName::from("Object"));
        let op = QualifiedName::from("tensor");

        let s_uuid = Uuid::now_v7();
        let i_uuid = Uuid::now_v7();
        let r_uuid = Uuid::now_v7();
        let infect_uuid = Uuid::now_v7();
        let recover_uuid = Uuid::now_v7();

        let s_name: QualifiedName = s_uuid.into();
        let i_name: QualifiedName = i_uuid.into();
        let r_name: QualifiedName = r_uuid.into();
        let infect_name: QualifiedName = infect_uuid.into();
        let recover_name: QualifiedName = recover_uuid.into();

        let mut inner = ModalDblModel::new(th);
        inner.add_ob(s_name.clone(), ob_type.clone());
        inner.add_ob(i_name.clone(), ob_type.clone());
        inner.add_ob(r_name.clone(), ob_type.clone());
        // infect: tensor(S, I) -> tensor(I, I), unnamed
        inner.add_mor(
            infect_name.clone(),
            ModalOb::App(
                ModalOb::List(
                    List::Symmetric,
                    vec![ModalOb::from(s_name.clone()), ModalOb::from(i_name.clone())],
                )
                .into(),
                op.clone(),
            ),
            ModalOb::App(
                ModalOb::List(
                    List::Symmetric,
                    vec![ModalOb::from(i_name.clone()), ModalOb::from(i_name.clone())],
                )
                .into(),
                op.clone(),
            ),
            ModalMorType::Zero(ob_type.clone()),
        );
        // recover: I -> R, unnamed
        inner.add_mor(
            recover_name.clone(),
            ModalOb::from(i_name.clone()),
            ModalOb::from(r_name.clone()),
            ModalMorType::Zero(ob_type),
        );

        // Set up namespaces with labels for species but NOT for transitions.
        let mut namespace = Namespace::new_for_uuid();
        namespace.set_label(s_uuid, LabelSegment::Text("S".into()));
        namespace.set_label(i_uuid, LabelSegment::Text("I".into()));
        namespace.set_label(r_uuid, LabelSegment::Text("R".into()));
        // Deliberately leave infect_uuid and recover_uuid unlabeled (unnamed).

        let model = DblModel {
            model: DblModelBox::from(inner),
            ty: None,
            ob_namespace: namespace.clone(),
            mor_namespace: namespace,
        };

        // Verify dom/cod labels resolve.
        let infect_labels = model.mor_generator_dom_cod_label_strings(&infect_name);
        assert_eq!(infect_labels, Some(("[S, I]".to_string(), "[I, I]".to_string())));

        let recover_labels = model.mor_generator_dom_cod_label_strings(&recover_name);
        assert_eq!(recover_labels, Some(("I".to_string(), "R".to_string())));

        // Generate balanced equations and verify no UUIDs or "?" appear.
        let modal_model = model.modal().unwrap();
        let analysis = ode::PetriNetMassActionAnalysis::default();
        let sys = analysis.build_system(modal_model, ode::MassConservationType::Balanced);
        let equations = sys
            .map_variables(latex_ob_names_mass_action(&model))
            .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(&model)))
            .to_latex_equations();

        for eq in &equations {
            assert!(!eq.rhs.contains('?'), "Equation should not contain '?': {}", eq.rhs);
            // UUID braces look like {xxxxxxxx-xxxx-... so check for that pattern.
            assert!(!eq.rhs.contains("{{0"), "Equation should not contain UUID: {}", eq.rhs);
        }

        // Check that the unnamed transitions use dom→cod format with \to in math mode.
        let all_rhs: String =
            equations.iter().map(|e| e.rhs.as_str()).collect::<Vec<_>>().join(" ");
        assert!(
            all_rhs.contains("\\text{[S, I]} \\to \\text{[I, I]}"),
            "Should contain '[S, I] \\to [I, I]' for unnamed infect, got: {}",
            all_rhs
        );
        assert!(
            all_rhs.contains("\\text{I} \\to \\text{R}"),
            "Should contain 'I \\to R' for unnamed recover, got: {}",
            all_rhs
        );
    }
}
