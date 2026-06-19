//! Auxiliary structs and glue code for any LaTeX code being passed through analyses.

use catlog::zero::QualifiedName;

use super::model::DblModel;

fn wrap_with_backslash_text(name: String) -> String {
    if name.chars().count() > 1 {
        format!("\\text{{{name}}}")
    } else {
        name.to_string()
    }
}

/// Creates a closure that formats object and morphism names for LaTeX output. When a morphism has a
/// name (and thus label), it is used directly; when unnamed, the label falls back to the format
/// `domain→codomain` (e.g., `X \to Y`).
pub(crate) fn latex_names(model: &DblModel) -> impl Fn(&QualifiedName) -> String {
    |id: &QualifiedName| {
        if let Some(ob_label) = model.ob_namespace.label(id) {
            wrap_with_backslash_text(ob_label.to_string())
        } else if let Some(mor_label) = model.mor_namespace.label(id) {
            wrap_with_backslash_text(mor_label.to_string())
        } else {
            let (dom, cod) = model
                .mor_generator_dom_cod_label_strings(id)
                .expect("Morphism in equation system should have domain and codomain");
            format!("{} \\to {}", wrap_with_backslash_text(dom), wrap_with_backslash_text(cod))
        }
    }
}

#[cfg(test)]
mod tests {
    use catlog::dbl::modal::{List, ModalMorType, ModalOb, ModalObType};
    use catlog::dbl::model::{ModalDblModel, MutDblModel};
    use catlog::latex::{Latex, LatexEquation, LatexEquations};
    use catlog::stdlib::analyses::ode::{
        LCCAnalysis, LotkaVolterraAnalysis, PetriNetMassActionAnalysis,
        StockFlowMassActionAnalysis, ode_semantics::*,
    };
    use catlog::stdlib::{analyses::ode, theories};
    use catlog::zero::{LabelSegment, Namespace, QualifiedName};
    use std::rc::Rc;
    use uuid::Uuid;

    use super::*;
    use crate::model::tests::{catalytic_petri_net, parallel_negative_cld};
    use crate::model::{DblModel, tests::backward_link};

    #[test]
    fn stock_flow_balanced_mass_action_latex_equations() {
        let model = backward_link("xxx", "yyy", "fff");
        let tab_model = model.discrete_tab().unwrap();
        let analysis = StockFlowMassActionAnalysis::default();
        let sys = analysis.build_system(tab_model);
        let equations = sys.to_latex_equations_with_map(|param| latex_names(&model)(param));

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{xxx}".to_string()),
                rhs: Latex("-r_{\\text{fff}} \\cdot \\text{xxx} \\cdot \\text{yyy}".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{yyy}".to_string()),
                rhs: Latex("r_{\\text{fff}} \\cdot \\text{xxx} \\cdot \\text{yyy}".to_string()),
            },
        ]);
        assert_eq!(equations, expected);
    }

    #[test]
    fn stock_flow_unbalanced_mass_action_latex_equations() {
        let model = backward_link("xxx", "yyy", "fff");
        let tab_model = model.discrete_tab().unwrap();
        let equations = StockFlowMassActionAnalysis {
            mass_conservation_type: ode::MassConservationType::Unbalanced(
                ode::RateGranularity::PerTransition,
            ),
            ..StockFlowMassActionAnalysis::default()
        }
        .build_system(tab_model)
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

    #[test]
    fn cld_lotka_volterra_latex_equations() {
        // The CLD with objects "x" and "yellow", and two negative links "f" and [unnamed] from x to y.
        let model = parallel_negative_cld("x", "yellow", "f", "");

        let discrete_model = model.discrete().unwrap();
        let equations = LotkaVolterraAnalysis::default()
            .build_system(discrete_model)
            .to_latex_equations_with_map(|param| latex_names(&model)(param));

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} x".to_string()),
                rhs: Latex(
                    "g_{x} \\cdot x"
                        .to_string(),
                ),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{yellow}".to_string()),
                rhs: Latex(
                    "(-k_{f} - k_{x \\to \\text{yellow}}) \\cdot x \\cdot \\text{yellow} + g_{\\text{yellow}} \\cdot \\text{yellow}"
                        .to_string(),
                ),
            },
        ]);

        assert_eq!(equations, expected);
    }

    #[test]
    fn cld_lcc_latex_equations() {
        // The CLD with objects "x" and "yellow", and two negative links "f" and [unnamed] from x to y.
        let model = parallel_negative_cld("x", "yellow", "f", "");
        let discrete_model = model.discrete().unwrap();
        let equations = LCCAnalysis::default()
            .build_system(discrete_model)
            .to_latex_equations_with_map(|param| latex_names(&model)(param));

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} x".to_string()),
                rhs: Latex("0".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{yellow}".to_string()),
                rhs: Latex(
                    "(-\\lambda_{f} - \\lambda_{x \\to \\text{yellow}}) \\cdot x".to_string(),
                ),
            },
        ]);

        assert_eq!(equations, expected);
    }

    #[test]
    fn petri_net_balanced_mass_action_latex_equations() {
        // The Petri net with places "liquid", "solid", and "c", and one (unnamed) transition [liquid, c] -> [solid, c].
        let model = catalytic_petri_net("liquid", "solid", "c", "");
        let modal_model = model.modal_unital().unwrap();
        let equations = PetriNetMassActionAnalysis::default()
            .build_system(modal_model)
            .to_latex_equations_with_map(|param| latex_names(&model)(param));

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{liquid}".to_string()),
                rhs: Latex(
                    "-r_{[\\text{liquid}, c] \\to [\\text{solid}, c]} \\text{liquid} \\cdot c"
                        .to_string(),
                ),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{solid}".to_string()),
                rhs: Latex(
                    "r_{[\\text{liquid}, c] \\to [\\text{solid}, c]} \\text{liquid} \\cdot c"
                        .to_string(),
                ),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} c".to_string()),
                rhs: Latex("0".to_string()),
            },
        ]);
        assert_eq!(equations, expected);
    }

    #[test]
    fn petri_net_unbalanced_pt_mass_action_latex_equations() {
        // The Petri net with places "liquid", "solid", and "c", and one (unnamed) transition [liquid, c] -> [solid, c].
        let model = catalytic_petri_net("liquid", "solid", "c", "");
        let modal_model = model.modal_unital().unwrap();
        let equations = PetriNetMassActionAnalysis {
            mass_conservation_type: ode::MassConservationType::Unbalanced(
                ode::RateGranularity::PerTransition,
            ),
            ..PetriNetMassActionAnalysis::default()
        }
        .build_system(modal_model)
        .to_latex_equations_with_map(|param| latex_names(&model)(param));

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{liquid}".to_string()),
                rhs: Latex("-\\kappa_{[\\text{liquid}, c] \\to [\\text{solid}, c]} \\text{liquid} \\cdot c".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{solid}".to_string()),
                rhs: Latex("\\rho_{[\\text{liquid}, c] \\to [\\text{solid}, c]} \\text{liquid} \\cdot c".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} c".to_string()),
                rhs: Latex("(\\rho_{[\\text{liquid}, c] \\to [\\text{solid}, c]} - \\kappa_{[\\text{liquid}, c] \\to [\\text{solid}, c]}) \\cdot \\text{liquid} \\cdot c".to_string()),
            },
        ]);
        assert_eq!(equations, expected);
    }

    #[test]
    fn petri_net_unbalanced_pp_mass_action_latex_equations() {
        // The Petri net with places "liquid", "solid", and "c", and one (unnamed) transition [liquid, c] -> [solid, c].
        let model = catalytic_petri_net("liquid", "solid", "c", "");
        let modal_model = model.modal_unital().unwrap();
        let equations = PetriNetMassActionAnalysis {
            mass_conservation_type: ode::MassConservationType::Unbalanced(
                ode::RateGranularity::PerPlace,
            ),
            ..PetriNetMassActionAnalysis::default()
        }
        .build_system(modal_model)
        .to_latex_equations_with_map(|param| latex_names(&model)(param));

        // TODO: write down the expected equations
        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{liquid}".to_string()),
                rhs: Latex("".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{solid}".to_string()),
                rhs: Latex("".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} c".to_string()),
                rhs: Latex("".to_string()),
            },
        ]);
        assert_eq!(equations, expected);
    }

    #[test]
    fn unnamed_mor_uses_dom_cod_in_equations() {
        let model = backward_link("xxx", "yyy", "");
        let tab_model = model.discrete_tab().unwrap();
        let equations = StockFlowMassActionAnalysis {
            mass_conservation_type: ode::MassConservationType::Unbalanced(
                ode::RateGranularity::PerTransition,
            ),
            ..StockFlowMassActionAnalysis::default()
        }
        .build_system(tab_model)
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
