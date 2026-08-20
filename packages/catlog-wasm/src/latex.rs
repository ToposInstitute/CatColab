//! Auxiliary structs and glue code for any LaTeX code being passed through analyses.

use catlog::{
    latex::{list_object_as_latex, wrap_with_backslash_text},
    zero::QualifiedName,
};

use super::model::DblModel;

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
                .mor_generator_dom_cod(id)
                .expect("Morphism in equation system should have domain and codomain.");
            let dom_labels: Vec<String> = model
                .get_ob_label(&dom)
                .expect("Object in equation system should have a label.")
                .into_iter()
                .map(|label| wrap_with_backslash_text(label.to_string()))
                .collect();
            let cod_labels: Vec<String> = model
                .get_ob_label(&cod)
                .expect("Object in equation system should have a label.")
                .into_iter()
                .map(|label| wrap_with_backslash_text(label.to_string()))
                .collect();
            format!(
                "{} \\to {}",
                list_object_as_latex(dom_labels),
                list_object_as_latex(cod_labels)
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use catlog::latex::{Latex, LatexEquation, LatexEquations};
    use catlog::stdlib::analyses::ode::{
        self, LinearODEAnalysis, LotkaVolterraAnalysis, MassActionEquationsConfig,
        PetriNetMassActionAnalysis, StockFlowMassActionAnalysis, ode_semantics::*,
    };

    use super::*;
    use crate::analyses::tests::{catalytic_petri_net, parallel_negative_cld};
    use crate::model::tests::backward_link;

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
    fn cld_linear_ode_latex_equations() {
        // The CLD with objects "x" and "yellow", and two negative links "f" and [unnamed] from x to y.
        let model = parallel_negative_cld("x", "yellow", "f", "");
        let discrete_model = model.discrete().unwrap();
        let equations = LinearODEAnalysis::default()
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
        let equations = StockFlowMassActionAnalysis::default()
            .build_configured_system(
                tab_model,
                MassActionEquationsConfig {
                    mass_conservation: ode::MassConservationType::Unbalanced(
                        ode::RateGranularity::PerTransition,
                    ),
                },
            )
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
                    "-r_{[\\text{liquid}, c] \\to [\\text{solid}, c]} \\cdot \\text{liquid} \\cdot c"
                        .to_string(),
                ),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{solid}".to_string()),
                rhs: Latex(
                    "r_{[\\text{liquid}, c] \\to [\\text{solid}, c]} \\cdot \\text{liquid} \\cdot c"
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
        let equations = PetriNetMassActionAnalysis::default()
            .build_configured_system(
                modal_model,
                MassActionEquationsConfig {
                    mass_conservation: ode::MassConservationType::Unbalanced(
                        ode::RateGranularity::PerTransition,
                    ),
                },
            )
            .to_latex_equations_with_map(|param| latex_names(&model)(param));

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{liquid}".to_string()),
                rhs: Latex("-\\kappa_{[\\text{liquid}, c] \\to [\\text{solid}, c]} \\cdot \\text{liquid} \\cdot c".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{solid}".to_string()),
                rhs: Latex("\\rho_{[\\text{liquid}, c] \\to [\\text{solid}, c]} \\cdot \\text{liquid} \\cdot c".to_string()),
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
        let equations = PetriNetMassActionAnalysis::default()
            .build_configured_system(
                modal_model,
                MassActionEquationsConfig {
                    mass_conservation: ode::MassConservationType::Unbalanced(
                        ode::RateGranularity::PerPlace,
                    ),
                },
            )
            .to_latex_equations_with_map(|param| latex_names(&model)(param));

        // TODO: write down the expected equations
        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{liquid}".to_string()),
                rhs: Latex("-\\kappa_{[\\text{liquid}, c] \\to [\\text{solid}, c]}^{\\text{liquid}} \\cdot \\text{liquid} \\cdot c".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{solid}".to_string()),
                rhs: Latex("\\rho_{[\\text{liquid}, c] \\to [\\text{solid}, c]}^{\\text{solid}} \\cdot \\text{liquid} \\cdot c".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} c".to_string()),
                rhs: Latex("(\\rho_{[\\text{liquid}, c] \\to [\\text{solid}, c]}^{c} - \\kappa_{[\\text{liquid}, c] \\to [\\text{solid}, c]}^{c}) \\cdot \\text{liquid} \\cdot c".to_string()),
            },
        ]);
        assert_eq!(equations, expected);
    }

    #[test]
    fn unnamed_mor_uses_dom_cod_in_equations() {
        let model = backward_link("xxx", "yyy", "");
        let tab_model = model.discrete_tab().unwrap();
        let equations = StockFlowMassActionAnalysis::default()
            .build_configured_system(
                tab_model,
                MassActionEquationsConfig {
                    mass_conservation: ode::MassConservationType::Unbalanced(
                        ode::RateGranularity::PerTransition,
                    ),
                },
            )
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
}
