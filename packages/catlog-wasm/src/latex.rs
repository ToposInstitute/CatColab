//! Auxiliary structs and glue code for any LaTeX code being passed through analyses.

use catlog::zero::QualifiedName;

use super::model::DblModel;

/// Creates a closure that formats object and morphism names for LaTeX output. When a morphism has a
/// name (and thus label), it is used directly; when unnamed, the label falls back to the format
/// `domain→codomain` (e.g., `X \to Y`).
pub(crate) fn latex_names(model: &DblModel) -> impl Fn(&QualifiedName) -> String {
    |id: &QualifiedName| {
        if let Some(ob_label) = model.ob_namespace.label(id) {
            if ob_label.to_string().chars().count() > 1 {
                format!("\\text{{{ob_label}}}")
            } else {
                format!("{ob_label}")
            }
        } else if let Some(mor_label) = model.mor_namespace.label(id) {
            if mor_label.to_string().chars().count() > 1 {
                format!("\\text{{{mor_label}}}")
            } else {
                format!("{mor_label}")
            }
        } else {
            let (dom, cod) = model
                .mor_generator_dom_cod_label_strings(id)
                .expect("Morphism in equation system should have domain and codomain");
            format!("\\text{{{dom}}} \\to \\text{{{cod}}}")
        }
    }
}

#[cfg(test)]
mod tests {
    use catlog::dbl::modal::{List, ModalMorType, ModalOb, ModalObType};
    use catlog::dbl::model::{ModalDblModel, MutDblModel};
    use catlog::latex::{Latex, LatexEquation, LatexEquations};
    use catlog::stdlib::analyses::ode::{StockFlowMassActionAnalysis, ode_semantics::*};
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
        let analysis = StockFlowMassActionAnalysis {
            mass_conservation_type: ode::MassConservationType::Unbalanced(
                ode::RateGranularity::PerTransition,
            ),
            ..StockFlowMassActionAnalysis::default()
        };
        let sys = analysis.build_system(tab_model);
        let equations = sys
            .to_latex_equations_with_map(|param| latex_names(&model)(param));

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{xxx}".to_string()),
                rhs: Latex(
                    "-\\kappa_{\\text{fff}} \\cdot \\text{xxx} \\cdot \\text{yyy}".to_string(),
                ),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{yyy}".to_string()),
                rhs: Latex("\\rho_{\\text{fff}} \\cdot \\text{xxx} \\cdot \\text{yyy}".to_string()),
            },
        ]);
        assert_eq!(equations, expected);
    }

    // TODO: add more tests here for the other ODE semantics

    #[test]
    fn unnamed_mor_uses_dom_cod_in_equations() {
        let model = backward_link("xxx", "yyy", "");
        let tab_model = model.discrete_tab().unwrap();
        let analysis = StockFlowMassActionAnalysis {
            mass_conservation_type: ode::MassConservationType::Unbalanced(
                ode::RateGranularity::PerTransition,
            ),
            ..StockFlowMassActionAnalysis::default()
        };
        let sys = analysis.build_system(tab_model);
        let equations = sys
            .to_latex_equations_with_map(|param| latex_names(&model)(param));

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{xxx}".to_string()),
                rhs: Latex(
                    "-\\kappa_{\\text{xxx} \\to \\text{yyy}} \\cdot \\text{xxx} \\cdot \\text{yyy}"
                        .to_string(),
                ),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{yyy}".to_string()),
                rhs: Latex(
                    "\\rho_{\\text{xxx} \\to \\text{yyy}} \\cdot \\text{xxx} \\cdot \\text{yyy}"
                        .to_string(),
                ),
            },
        ]);
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
