//! Auxiliary structs and glue code for data passed to/from analyses.

use catlog::latex::LatexEquations;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::simulate::ode::PolynomialSystem;
use catlog::stdlib::analyses::ode::{self, ODESemantics, ODESemanticsProblemData, Parameter};
use catlog::zero::QualifiedName;

use super::latex::latex_names;
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

/// Simulate specific ODE semantics on a model, for use in a simulation analysis.
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

/// Generate the equations of specific ODE semantics on a model, for use in an equations analysis.
pub(crate) fn ode_semantics_equations<S: ODESemantics>(
    model: &DblModel,
    system: PolynomialSystem<QualifiedName, Parameter<S::ParameterType>, i8>,
) -> Result<LatexEquations, String> {
    Ok(system.to_latex_equations_with_map(|param| latex_names(model)(param)))
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::model::{DblModel, tests::backward_link};
    use crate::theories::{ThSignedCategory, ThSymMonoidalCategory};
    use catcolab_document_types::v2::{Modality, MorDecl, MorType, Ob, ObDecl, ObType};
    use catlog::dbl::modal::{List, ModalMorType, ModalOb, ModalObType};
    use catlog::dbl::model::{ModalDblModel, MutDblModel};
    use catlog::latex::{Latex, LatexEquation, LatexEquations};
    use catlog::stdlib::{
        analyses::ode::{self, MassConservationType, ODESemanticsAnalysis},
        theories,
    };
    use catlog::zero::{LabelSegment, Namespace, QualifiedName};
    use std::rc::Rc;
    use uuid::Uuid;

    // TODO: test for polynomial_ode_simulation

    #[test]
    fn cld_lotka_volterra_latex_equations() {
        let model = parallel_negative_cld("x", "yellow", "f", "");
        let system = ode::LotkaVolterraAnalysis::default().build_system(model.discrete().unwrap());
        let equations =
            ode_semantics_equations::<ode::LotkaVolterraSemantics>(&model, system).unwrap();

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
        let model = parallel_negative_cld("x", "yellow", "f", "");
        let system = ode::LinearODEAnalysis::default().build_system(model.discrete().unwrap());
        let equations = ode_semantics_equations::<ode::LinearODESemantics>(&model, system).unwrap();

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
        let system = ode::StockFlowMassActionAnalysis {
            mass_conservation_type: MassConservationType::Balanced,
            ..ode::StockFlowMassActionAnalysis::default()
        }
        .build_system(model.discrete_tab().unwrap());
        let equations =
            ode_semantics_equations::<ode::StockFlowMassActionSemantics>(&model, system).unwrap();

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
        let system = ode::StockFlowMassActionAnalysis {
            mass_conservation_type: MassConservationType::Unbalanced(
                ode::RateGranularity::PerTransition,
            ),
            ..ode::StockFlowMassActionAnalysis::default()
        }
        .build_system(model.discrete_tab().unwrap());
        let equations =
            ode_semantics_equations::<ode::StockFlowMassActionSemantics>(&model, system).unwrap();

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
        let system = ode::PetriNetMassActionAnalysis {
            mass_conservation_type: MassConservationType::Balanced,
            ..ode::PetriNetMassActionAnalysis::default()
        }
        .build_system(model.modal_unital().unwrap());
        let equations =
            ode_semantics_equations::<ode::PetriNetMassActionSemantics>(&model, system).unwrap();

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
        let system = ode::PetriNetMassActionAnalysis {
            mass_conservation_type: MassConservationType::Unbalanced(
                ode::RateGranularity::PerTransition,
            ),
            ..ode::PetriNetMassActionAnalysis::default()
        }
        .build_system(model.modal_unital().unwrap());
        let equations =
            ode_semantics_equations::<ode::PetriNetMassActionSemantics>(&model, system).unwrap();

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
        let system = ode::PetriNetMassActionAnalysis {
            mass_conservation_type: MassConservationType::Unbalanced(
                ode::RateGranularity::PerPlace,
            ),
            ..ode::PetriNetMassActionAnalysis::default()
        }
        .build_system(model.modal_unital().unwrap());
        let equations =
            ode_semantics_equations::<ode::PetriNetMassActionSemantics>(&model, system).unwrap();

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

    /// Construct a causal loop diagram with objects x, y and negative links f, g : x -> y.
    fn parallel_negative_cld(
        src_name: &str,
        tgt_name: &str,
        first_link_name: &str,
        second_link_name: &str,
    ) -> DblModel {
        let th = ThSignedCategory::new().theory();
        let mut model = DblModel::new(&th);
        let [x, y, f, g] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];

        assert!(
            model
                .add_ob(&ObDecl {
                    name: src_name.into(),
                    id: x,
                    ob_type: ObType::Basic("Object".into())
                })
                .is_ok()
        );
        assert!(
            model
                .add_ob(&ObDecl {
                    name: tgt_name.into(),
                    id: y,
                    ob_type: ObType::Basic("Object".into())
                })
                .is_ok()
        );
        assert!(
            model
                .add_mor(&MorDecl {
                    name: first_link_name.into(),
                    id: f,
                    mor_type: MorType::Basic("Negative".into()),
                    dom: Some(Ob::Basic(x.to_string())),
                    cod: Some(Ob::Basic(y.to_string())),
                })
                .is_ok()
        );
        assert!(
            model
                .add_mor(&MorDecl {
                    name: second_link_name.into(),
                    id: g,
                    mor_type: MorType::Basic("Negative".into()),
                    dom: Some(Ob::Basic(x.to_string())),
                    cod: Some(Ob::Basic(y.to_string())),
                })
                .is_ok()
        );

        model
    }

    /// Construct a Petri net representing a catalytic transition [x,c] -> [y,c].
    fn catalytic_petri_net(
        src_name: &str,
        tgt_name: &str,
        catalyst_name: &str,
        _transition_name: &str,
    ) -> DblModel {
        let th = ThSymMonoidalCategory::new().theory();
        let mut model = DblModel::new(&th);
        let [x, y, c, _t] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];

        assert!(
            model
                .add_ob(&ObDecl {
                    name: src_name.into(),
                    id: x,
                    // ob_type: ObType::Basic("Object".into()),
                    // TODO: what is the correct ob_type here?
                    ob_type: ObType::ModeApp {
                        modality: Modality::SymmetricList,
                        ob_type: Box::new(ObType::Basic("Object".into()))
                    },
                })
                .is_ok()
        );
        assert!(
            model
                .add_ob(&ObDecl {
                    name: tgt_name.into(),
                    id: y,
                    // ob_type: ObType::Basic("Object".into()),
                    ob_type: ObType::ModeApp {
                        modality: Modality::SymmetricList,
                        ob_type: Box::new(ObType::Basic("Object".into()))
                    },
                })
                .is_ok()
        );
        assert!(
            model
                .add_ob(&ObDecl {
                    name: catalyst_name.into(),
                    id: c,
                    // ob_type: ObType::Basic("Object".into()),
                    ob_type: ObType::ModeApp {
                        modality: Modality::SymmetricList,
                        ob_type: Box::new(ObType::Basic("Object".into()))
                    },
                })
                .is_ok()
        );
        // TODO: add the transition [x, c] -> [y, c]

        model
    }
}
