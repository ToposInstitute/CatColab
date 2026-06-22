//! Auxiliary structs and glue code for data passed to/from analyses.

use catlog::latex::LatexEquations;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::simulate::ode::PolynomialSystem;
use catlog::stdlib::analyses::ode::{
    self, ODESemantics, ODESemanticsAnalysis, ODESemanticsProblemData, Parameter,
};
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

/// Generates the PolynomialSystem for the systems of polynomial ODEs.
pub(crate) fn polynomial_ode_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<QualifiedName>, i8>, String> {
    let realised_model = model.modal_nonunital()?;
    let analysis = ode::PolynomialODEAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

// // TODO: This enum should already be defined somewhere else...
// enum Doctrine {
//     Discrete,
//     Tabulated,
//     ModalUnital,
//     ModalNonUnital,
// }

//     match doctrine {
//         Doctrine::Discrete => {
//             let realised_model = model.discrete()?;
//             let analysis = <S::AnalysisType>::default();
//             Ok(analysis.build_system(realised_model))
//         }
//         Doctrine::Tabulated => {
//             let realised_model = model.discrete_tab()?;
//             let analysis = S::AnalysisType::default();
//             Ok(analysis.build_system(realised_model))
//         }
//         Doctrine::ModalUnital => {
//             let realised_model = model.modal_unital()?;
//             let analysis = S::AnalysisType::default();
//             Ok(analysis.build_system(realised_model))
//         }
//         Doctrine::ModalNonUnital => {
//             let realised_model = model.modal_nonunital()?;
//             let analysis = S::AnalysisType::default();
//             Ok(analysis.build_system(realised_model))
//         }
//     }

// // TODO: define `fn polynomial_system<S: ODESemantics>` ??????????
// fn ode_semantics_system<S: ODESemantics>(
//     model: &DblModel,
//     // doctrine: Doctrine,
// ) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<S::ParameterType>, i8>, String> {
//     let realised_model = model.discrete()?;
//     let analysis = <S::AnalysisType>::default();
//     Ok(analysis.build_system(std::rc::Rc::<catlog::dbl::model::DiscreteDblModel>::unwrap_or_clone(realised_model)))
// }

// fn ode_semantics_system<S: ODESemantics>(
//     model: &Rc<S::ModelType>,
// ) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<S::ParameterType>, i8>, String> {
//     let analysis = S::AnalysisType::default();
//     // TODO: can we just use .try_into() directly? as in e.g. the definition for modal_nonunital()
//     Ok(analysis.build_system(model))
// }

/// Generates the PolynomialSystem for Lotka-Volterra dynamics.
pub(crate) fn lotka_volterra_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::LotkaVolterraParameter>, i8>, String>
{
    let realised_model = model.discrete()?;
    let analysis = ode::LotkaVolterraAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

/// Generates the PolynomialSystem for LCC dynamics.
pub(crate) fn linear_ode_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::LCCParameter>, i8>, String> {
    let realised_model = model.discrete()?;
    let analysis = ode::LCCAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

// TODO: you should be able to REMOVE this enum
/// Mass-action analysis is currently implemented for Petri nets and stock-flow diagrams
/// and we can avoid some code reduplication by making this explicit.
#[derive(Copy, Clone)]
pub(crate) enum MassActionAnalysisLogic {
    /// The modal theory of Petri nets.
    PetriNet,
    /// The discrete tabulator theory of stock-flow diagrams.
    StockFlow,
}

/// Generates the PolynomialSystem for mass-action dynamics.
pub(crate) fn mass_action_system(
    model: &DblModel,
    mass_conservation_type: ode::MassConservationType,
    logic: MassActionAnalysisLogic,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::MassActionParameter>, i8>, String> {
    match logic {
        MassActionAnalysisLogic::PetriNet => {
            let realised_model = model.modal_unital()?;
            let analysis = ode::PetriNetMassActionAnalysis {
                mass_conservation_type,
                ..ode::PetriNetMassActionAnalysis::default()
            };
            Ok(analysis.build_system(realised_model))
        }
        MassActionAnalysisLogic::StockFlow => {
            let realised_model = model.discrete_tab()?;
            let analysis = ode::StockFlowMassActionAnalysis {
                mass_conservation_type,
                ..ode::StockFlowMassActionAnalysis::default()
            };
            Ok(analysis.build_system(realised_model))
        }
    }
}

/// TODO: documentation.
// TODO: rewrite this to use ode_semantics_system, so that there's no need to preface with e.g.
//          let system = lotka_volterra_system(model);
//       in theories.rs
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

/// TODO: documentation.
// TODO: rewrite this to use ode_semantics_system, so that there's no need to preface with e.g.
//          let system = lotka_volterra_system(model);
//       in theories.rs
pub(crate) fn ode_semantics_equations<S: ODESemantics>(
    model: &DblModel,
    system: PolynomialSystem<QualifiedName, Parameter<S::ParameterType>, i8>,
) -> Result<LatexEquations, String> {
    Ok(system.to_latex_equations_with_map(|param| latex_names(model)(param)))
}

// TODO: replace this with ode_semantics_simulation by implementing ODESemantics for polynomial_ode ???
/// Simulates polynomial ODE equations.
pub(crate) fn polynomial_ode_simulation(
    model: &DblModel,
    problem_data: ode::PolynomialODEProblemData,
) -> Result<ODEResultWithEquations, String> {
    let system = polynomial_ode_system(model);
    let sys_extended_scalars = problem_data.extend_scalars(system?);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_names(model)).to_latex_equations();
    let analysis = problem_data.build_analysis(sys_extended_scalars);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations,
    })
}

// TODO: replace this with ode_semantics_equations by implementing ODESemantics for polynomial_ode ???
/// Generates equations for the system of polynomial ODEs.
pub(crate) fn polynomial_ode_equations(model: &DblModel) -> Result<LatexEquations, String> {
    let system = polynomial_ode_system(model);
    let equations = system?.to_latex_equations_with_map(|param| latex_names(model)(param));
    Ok(equations)
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::latex::latex_names;
    use crate::model::{DblModel, tests::backward_link};
    use crate::theories::{ThSignedCategory, ThSymMonoidalCategory};
    use catcolab_document_types::v2::{Modality, MorDecl, MorType, Ob, ObDecl, ObType};
    use catlog::dbl::modal::{List, ModalMorType, ModalOb, ModalObType};
    use catlog::dbl::model::{ModalDblModel, MutDblModel};
    use catlog::latex::{Latex, LatexEquation, LatexEquations};
    use catlog::stdlib::analyses::ode::{MassConservationType, PetriNetMassActionAnalysis, StockFlowMassActionAnalysis};
    use catlog::stdlib::{analyses::ode, theories};
    use catlog::zero::{LabelSegment, Namespace, QualifiedName};
    use std::rc::Rc;
    use uuid::Uuid;

    #[test]
    fn cld_lotka_volterra_latex_equations() {
        let model = parallel_negative_cld("x", "yellow", "f", "");
        let system = lotka_volterra_system(&model).unwrap();
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
        let system = linear_ode_system(&model).unwrap();
        let equations = ode_semantics_equations::<ode::LCCSemantics>(&model, system).unwrap();

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
        let system = mass_action_system(
            &model,
            MassConservationType::Balanced,
            MassActionAnalysisLogic::StockFlow,
        ).unwrap();
        let equations = ode_semantics_equations::<ode::StockFlowMassActionSemantics>(&model, system).unwrap();

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
        let system = mass_action_system(
            &model,
            MassConservationType::Unbalanced(ode::RateGranularity::PerTransition),
            MassActionAnalysisLogic::StockFlow,
        ).unwrap();
        let equations = ode_semantics_equations::<ode::StockFlowMassActionSemantics>(&model, system).unwrap();

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

    // TODO: REMOVE THIS #[ignore]
    #[test]
    #[ignore]
    fn petri_net_balanced_mass_action_latex_equations() {
        // The Petri net with places "liquid", "solid", and "c", and one (unnamed) transition [liquid, c] -> [solid, c].
        let model = catalytic_petri_net("liquid", "solid", "c", "");
        let system = mass_action_system(
            &model,
            MassConservationType::Balanced,
            MassActionAnalysisLogic::PetriNet,
        ).unwrap();
        let equations = ode_semantics_equations::<ode::PetriNetMassActionSemantics>(&model, system).unwrap();

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

    // TODO: REMOVE THIS #[ignore]
    #[test]
    #[ignore]
    fn petri_net_unbalanced_pt_mass_action_latex_equations() {
        // The Petri net with places "liquid", "solid", and "c", and one (unnamed) transition [liquid, c] -> [solid, c].
        let model = catalytic_petri_net("liquid", "solid", "c", "");
        let system = mass_action_system(
            &model,
            MassConservationType::Unbalanced(ode::RateGranularity::PerTransition),
            MassActionAnalysisLogic::PetriNet,
        ).unwrap();
        let equations = ode_semantics_equations::<ode::PetriNetMassActionSemantics>(&model, system).unwrap();

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

    // TODO: REMOVE THIS #[ignore]
    #[test]
    #[ignore]
    fn petri_net_unbalanced_pp_mass_action_latex_equations() {
        // The Petri net with places "liquid", "solid", and "c", and one (unnamed) transition [liquid, c] -> [solid, c].
        let model = catalytic_petri_net("liquid", "solid", "c", "");
        let system = mass_action_system(
            &model,
            MassConservationType::Unbalanced(ode::RateGranularity::PerPlace),
            MassActionAnalysisLogic::PetriNet,
        ).unwrap();
        let equations = ode_semantics_equations::<ode::PetriNetMassActionSemantics>(&model, system).unwrap();

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
