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
    use crate::theories::ThSignedCategory;
    use catcolab_document_types::v2::{MorDecl, MorType, Ob, ObDecl, ObType};
    use catlog::dbl::modal::{List, ModalMorType, ModalOb, ModalObType, ModeApp};
    use catlog::dbl::model::{ModalDblModel, MutDblModel};
    use catlog::latex::{Latex, LatexEquation, LatexEquations};
    use catlog::stdlib::{
        analyses::ode::{self, MassConservationType, ODESemanticsAnalysis},
        theories,
    };
    use catlog::zero::{LabelSegment, Namespace, QualifiedName};
    use std::rc::Rc;
    use uuid::Uuid;

    #[test]
    fn signed_polynomial_ode_latex_equations() {
        // The signed multicategory with objects `x`, `y`, and `zonk`, (unnamed) positive morphisms
        // `[x,y] -+-> z` and `q : z -+-> y`, and a negative morphism `negative : [x,x,y,z] ---> x`.
        let model = example_signed_multicategory("x", "y", "zonk", "", "", "negative");
        let system =
            ode::PolynomialODEAnalysis::default().build_system(model.modal_nonunital().unwrap());
        let equations =
            ode_semantics_equations::<ode::PolynomialODESemantics>(&model, system).unwrap();

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} x".to_string()),
                rhs: Latex(
                    "-\\lambda_{\\text{negative}} \\cdot x^2 \\cdot y \\cdot \\text{zonk}"
                        .to_string(),
                ),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string()),
                rhs: Latex("\\lambda_{\\text{zonk} \\to y} \\cdot \\text{zonk}".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{zonk}".to_string()),
                rhs: Latex("\\lambda_{[x,y] \\to \\text{zonk}} \\cdot x \\cdot y".to_string()),
            },
        ]);

        assert_eq!(equations, expected);
    }

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
        let model = backward_link("xylophone", "y", "fff");
        let system = ode::StockFlowMassActionAnalysis {
            mass_conservation_type: MassConservationType::Balanced,
            ..ode::StockFlowMassActionAnalysis::default()
        }
        .build_system(model.discrete_tab().unwrap());
        let equations =
            ode_semantics_equations::<ode::StockFlowMassActionSemantics>(&model, system).unwrap();

        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{xylophone}".to_string()),
                rhs: Latex("-r_{\\text{fff}} \\cdot \\text{xylophone} \\cdot y".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string()),
                rhs: Latex("r_{\\text{fff}} \\cdot \\text{xylophone} \\cdot y".to_string()),
            },
        ]);
        assert_eq!(equations, expected);
    }

    #[test]
    fn stock_flow_unbalanced_mass_action_latex_equations() {
        let model = backward_link("xylophone", "y", "fff");
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
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{xylophone}".to_string()),
                rhs: Latex("-\\kappa_{\\text{fff}} \\cdot \\text{xylophone} \\cdot y".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string()),
                rhs: Latex("\\rho_{\\text{fff}} \\cdot \\text{xylophone} \\cdot y".to_string()),
            },
        ]);
        assert_eq!(equations, expected);
    }

    #[test]
    fn petri_net_balanced_mass_action_latex_equations() {
        // The Petri net with places `liquid`, `solid`, and `c`, and one (unnamed) transition `[liquid, c] -> [solid, c]`.
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
        let system = ode::PetriNetMassActionAnalysis {
            mass_conservation_type: MassConservationType::Unbalanced(
                ode::RateGranularity::PerPlace,
            ),
            ..ode::PetriNetMassActionAnalysis::default()
        }
        .build_system(model.modal_unital().unwrap());
        let equations =
            ode_semantics_equations::<ode::PetriNetMassActionSemantics>(&model, system).unwrap();

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

    /// Construct a causal loop diagram with objects x, y and negative links f, g : x -> y.
    fn parallel_negative_cld(
        source_name: &str,
        target_name: &str,
        first_link_name: &str,
        second_link_name: &str,
    ) -> DblModel {
        let th = ThSignedCategory::new().theory();
        let mut model = DblModel::new(&th);
        let [x, y, f, g] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];

        assert!(
            model
                .add_ob(&ObDecl {
                    name: source_name.into(),
                    id: x,
                    ob_type: ObType::Basic("Object".into())
                })
                .is_ok()
        );
        assert!(
            model
                .add_ob(&ObDecl {
                    name: target_name.into(),
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

    /// Construct a signed multicategory with objects `x, y, z`, positive morphisms `p : [x,y] -+-> z`
    /// and `q : z -+-> y`, and negative morphism `n : [x,x,y,z] ---> x`.
    fn example_signed_multicategory(
        x_name: &str,
        y_name: &str,
        z_name: &str,
        p_name: &str,
        q_name: &str,
        n_name: &str,
    ) -> DblModel {
        let th = Rc::new(theories::th_signed_polynomial_ode_system());
        let ob_type = ModalObType::new(("State").into());
        let pos_mor_type: ModalMorType = ModeApp::new(("Contribution").into()).into();
        let neg_mor_type: ModalMorType = ModeApp::new(("NegativeContribution").into()).into();

        let mut inner = ModalDblModel::new(th);

        let [x, y, z, p, q, n] = [
            Uuid::now_v7(),
            Uuid::now_v7(),
            Uuid::now_v7(),
            Uuid::now_v7(),
            Uuid::now_v7(),
            Uuid::now_v7(),
        ];

        inner.add_ob(x.into(), ob_type.clone());
        inner.add_ob(y.into(), ob_type.clone());
        inner.add_ob(z.into(), ob_type.clone());

        inner.add_mor(
            p_name.into(),
            ModalOb::List(
                List::Symmetric,
                vec![ModalOb::Generator(x.into()), ModalOb::Generator(y.into())],
            ),
            ModalOb::Generator(z.into()),
            pos_mor_type.clone(),
        );
        inner.add_mor(
            q_name.into(),
            ModalOb::List(List::Symmetric, vec![ModalOb::Generator(z.into())]),
            ModalOb::Generator(y.into()),
            pos_mor_type.clone(),
        );
        inner.add_mor(
            n_name.into(),
            ModalOb::List(
                List::Symmetric,
                vec![
                    ModalOb::Generator(x.into()),
                    ModalOb::Generator(x.into()),
                    ModalOb::Generator(y.into()),
                    ModalOb::Generator(z.into()),
                ],
            ),
            ModalOb::Generator(x.into()),
            neg_mor_type.clone(),
        );

        let mut ob_namespace = Namespace::new_for_uuid();
        ob_namespace.set_label(x, LabelSegment::Text(x_name.into()));
        ob_namespace.set_label(y, LabelSegment::Text(y_name.into()));
        ob_namespace.set_label(z, LabelSegment::Text(z_name.into()));
        ob_namespace.set_label(p, LabelSegment::Text(p_name.into()));
        ob_namespace.set_label(q, LabelSegment::Text(q_name.into()));
        ob_namespace.set_label(n, LabelSegment::Text(n_name.into()));

        DblModel {
            model: inner.into(),
            ty: None,
            ob_namespace,
            mor_namespace: Namespace::new_for_uuid(),
        }
    }

    /// Construct a Petri net representing a catalytic transition [x,c] -> [y,c].
    fn catalytic_petri_net(
        source_name: &str,
        target_name: &str,
        catalyst_name: &str,
        transition_name: &str,
    ) -> DblModel {
        let th = Rc::new(theories::th_sym_monoidal_category());
        let ob_type = ModalObType::new(QualifiedName::from("Object"));
        let op = QualifiedName::from("tensor");

        let [x, y, c, t] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];

        let mut inner = ModalDblModel::new(th);
        inner.add_ob(x.into(), ob_type.clone());
        inner.add_ob(y.into(), ob_type.clone());
        inner.add_ob(c.into(), ob_type.clone());

        inner.add_mor(
            t.into(),
            ModalOb::App(
                ModalOb::List(
                    List::Symmetric,
                    vec![ModalOb::Generator(x.into()), ModalOb::Generator(c.into())],
                )
                .into(),
                op.clone(),
            ),
            ModalOb::App(
                ModalOb::List(
                    List::Symmetric,
                    vec![ModalOb::Generator(y.into()), ModalOb::Generator(c.into())],
                )
                .into(),
                op.clone(),
            ),
            ModalMorType::Zero(ob_type.clone()),
        );

        let mut ob_namespace = Namespace::new_for_uuid();
        ob_namespace.set_label(x, LabelSegment::Text(source_name.into()));
        ob_namespace.set_label(y, LabelSegment::Text(target_name.into()));
        ob_namespace.set_label(c, LabelSegment::Text(catalyst_name.into()));
        ob_namespace.set_label(t, LabelSegment::Text(transition_name.into()));

        DblModel {
            model: inner.into(),
            ty: None,
            ob_namespace,
            mor_namespace: Namespace::new_for_uuid(),
        }
    }
}
