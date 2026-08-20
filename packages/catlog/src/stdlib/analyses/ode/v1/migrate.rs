//! Migrations from v0 to v1 for analyses.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::stdlib::analyses::ode::v0::linear_ode::LinearODEProblemData;
use crate::stdlib::analyses::ode::v0::lotka_volterra::LotkaVolterraProblemData;
use crate::stdlib::analyses::ode::v0::mass_action::MassActionProblemData;
use crate::stdlib::analyses::ode::v0::polynomial_ode::PolynomialODEProblemData;
use crate::stdlib::analyses::ode::{
    LinearODEParameterData, LinearODESemantics, LotkaVolterraParameterData, LotkaVolterraSemantics,
    MassActionParameterData, ODESemanticsProblemData, PetriNetMassActionSemantics,
    PetriNetUnbalancedMassActionSemantics, PetriNetVeryUnbalancedMassActionSemantics,
    PolynomialODEParameterData, PolynomialODESemantics, StockFlowMassActionSemantics,
    StockFlowUnbalancedMassActionSemantics, UnbalancedMassActionParameterData,
    VeryUnbalancedMassActionParameterData,
};

/// Migration for problem data for linear ODE.
pub fn migrate_linear_ode_v0_to_v1(
    v0: LinearODEProblemData,
) -> ODESemanticsProblemData<LinearODESemantics> {
    let v1: ODESemanticsProblemData<LinearODESemantics> = ODESemanticsProblemData {
        initial_values: v0.initial_values,
        duration: v0.duration,
        parameter_data: LinearODEParameterData { coefficients: v0.coefficients },
    };
    v1
}

/// Migration for problem data for Lotka-Volterra.
pub fn migrate_lotka_volterra_v0_to_v1(
    v0: LotkaVolterraProblemData,
) -> ODESemanticsProblemData<LotkaVolterraSemantics> {
    let v1: ODESemanticsProblemData<LotkaVolterraSemantics> = ODESemanticsProblemData {
        initial_values: v0.initial_values,
        duration: v0.duration,
        parameter_data: LotkaVolterraParameterData {
            interaction_coeffs: v0.interaction_coeffs,
            growth_rates: v0.growth_rates,
        },
    };
    v1
}

/// Migration for problem data for polynomial ODE.
pub fn migrate_polynomial_ode_v0_to_v1(
    v0: PolynomialODEProblemData,
) -> ODESemanticsProblemData<PolynomialODESemantics> {
    let v1: ODESemanticsProblemData<PolynomialODESemantics> = ODESemanticsProblemData {
        initial_values: v0.initial_values,
        duration: v0.duration,
        parameter_data: PolynomialODEParameterData { coefficients: v0.coefficients },
    };
    v1
}

/// In order for `migrate_petri_net_mass_action_v0_to_v1` to have a well-defined return type, we
/// unify the three mass-action semantics for Petri nets into a single struct.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct PetriNetMassActionProblemData {
    balanced: ODESemanticsProblemData<PetriNetMassActionSemantics>,
    unbalanced: ODESemanticsProblemData<PetriNetUnbalancedMassActionSemantics>,
    very_unbalanced: ODESemanticsProblemData<PetriNetVeryUnbalancedMassActionSemantics>,
}

/// Migration for problem data for mass-action on a Petri net.
pub fn migrate_petri_net_mass_action_v0_to_v1(
    v0: MassActionProblemData,
) -> PetriNetMassActionProblemData {
    let balanced: ODESemanticsProblemData<PetriNetMassActionSemantics> = ODESemanticsProblemData {
        initial_values: v0.initial_values.clone(),
        duration: v0.duration,
        parameter_data: MassActionParameterData { rates: v0.transition_rates },
    };
    let unbalanced: ODESemanticsProblemData<PetriNetUnbalancedMassActionSemantics> =
        ODESemanticsProblemData {
            initial_values: v0.initial_values.clone(),
            duration: v0.duration,
            parameter_data: UnbalancedMassActionParameterData {
                consumption_rates: v0.transition_consumption_rates,
                production_rates: v0.transition_production_rates,
            },
        };
    let very_unbalanced: ODESemanticsProblemData<PetriNetVeryUnbalancedMassActionSemantics> =
        ODESemanticsProblemData {
            initial_values: v0.initial_values,
            duration: v0.duration,
            parameter_data: VeryUnbalancedMassActionParameterData {
                consumption_rates: v0.place_consumption_rates,
                production_rates: v0.place_production_rates,
            },
        };

    PetriNetMassActionProblemData { balanced, unbalanced, very_unbalanced }
}

/// In order for `migrate_stock_flow_mass_action_v0_to_v1` to have a well-defined return type, we
/// unify the three mass-action semantics for stock-flow diagrams into a single struct.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct StockFlowMassActionProblemData {
    balanced: ODESemanticsProblemData<StockFlowMassActionSemantics>,
    unbalanced: ODESemanticsProblemData<StockFlowUnbalancedMassActionSemantics>,
}

/// Migration for problem data for mass-action on a stock-flow diagram.
pub fn migrate_stock_flow_mass_action_v0_to_v1(
    v0: MassActionProblemData,
) -> StockFlowMassActionProblemData {
    let balanced: ODESemanticsProblemData<StockFlowMassActionSemantics> = ODESemanticsProblemData {
        initial_values: v0.initial_values.clone(),
        duration: v0.duration,
        parameter_data: MassActionParameterData { rates: v0.transition_rates },
    };
    let unbalanced: ODESemanticsProblemData<StockFlowUnbalancedMassActionSemantics> =
        ODESemanticsProblemData {
            initial_values: v0.initial_values.clone(),
            duration: v0.duration,
            parameter_data: UnbalancedMassActionParameterData {
                consumption_rates: v0.transition_consumption_rates,
                production_rates: v0.transition_production_rates,
            },
        };
    StockFlowMassActionProblemData { balanced, unbalanced }
}

#[cfg(test)]
mod test {
    use std::{collections::HashMap, rc::Rc};

    use super::*;
    use crate::{
        stdlib::{
            analyses::ode::{
                LinearODEAnalysis, LotkaVolterraAnalysis, ODESemanticsAnalysis,
                PetriNetMassActionAnalysis, PetriNetUnbalancedMassActionAnalysis,
                PetriNetVeryUnbalancedMassActionAnalysis, PolynomialODEAnalysis,
                StockFlowMassActionAnalysis, StockFlowUnbalancedMassActionAnalysis,
                v0::mass_action::MassActionEquationsData,
            },
            backward_link, catalyzed_reaction, negative_feedback, th_category_links,
            th_polynomial_ode_system, th_signed_category, th_sym_monoidal_category,
            unsigned_lotka_volterra_dynamics,
        },
        zero::name,
    };
    use expect_test::expect;

    #[test]
    fn linear_ode_v0_to_v1_migration() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);

        let v0_data = LinearODEProblemData {
            coefficients: [(name("positive"), 3.0), (name("negative"), 2.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let v1_data = migrate_linear_ode_v0_to_v1(v0_data);

        let system = LinearODEAnalysis::default().build_system(&model);
        let analysis = v1_data.extend_scalars(system);
        let expected = expect!([r#"
            dx = -2 y
            dy = 3 x
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    #[test]
    fn lotka_volterra_v0_to_v1_migration() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);

        let v0_data = LotkaVolterraProblemData {
            interaction_coeffs: [(name("positive"), 1.0), (name("negative"), 1.0)]
                .into_iter()
                .collect(),
            growth_rates: [(name("x"), 2.0), (name("y"), -1.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let v1_data = migrate_lotka_volterra_v0_to_v1(v0_data);

        let system = LotkaVolterraAnalysis::default().build_system(&model);
        let analysis = v1_data.extend_scalars(system);
        let expected = expect!([r#"
            dx = 2 x - x y
            dy = x y - y
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    #[test]
    fn polynomial_ode_v0_to_v1_migration() {
        let th = Rc::new(th_polynomial_ode_system());
        let model = unsigned_lotka_volterra_dynamics(th);

        let v0_data = PolynomialODEProblemData {
            coefficients: [
                (name("A_growth"), 1.0),
                (name("B_growth"), 2.0),
                (name("C_growth"), -2.0),
                (name("AB_interaction"), 1.5),
                (name("BA_interaction"), -2.0),
                (name("BC_interaction"), 3.0),
                (name("CB_interaction"), -3.0),
            ]
            .into_iter()
            .collect(),
            initial_values: [(name("a"), 1.0), (name("b"), 1.0), (name("c"), 1.0)]
                .into_iter()
                .collect(),
            duration: 10.0,
        };

        let v1_data = migrate_polynomial_ode_v0_to_v1(v0_data);

        let system = PolynomialODEAnalysis::default().build_system(&model);
        let analysis = v1_data.extend_scalars(system);
        let expected = expect!([r#"
            dA = A - 2 A B
            dB = 1.5 A B + 2 B - 3 B C
            dC = 3 B C - 2 C
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    // TODO: Petri net mass-action migration tests.

    #[test]
    fn petri_net_mass_action_v0_to_v1_migration() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);

        let v0_data = MassActionProblemData {
            initial_values: [(name("x"), 1.0), (name("y"), 1.5), (name("c"), 2.0)]
                .into_iter()
                .collect(),
            duration: 10.0,
            equations_data: MassActionEquationsData {
                mass_conservation_type:
                    crate::stdlib::analyses::ode::v0::mass_action::MassConservationType::Balanced,
            },
            transition_rates: [(name("f"), 1.5)].into_iter().collect(),
            transition_consumption_rates: [(name("f"), 3.5)].into_iter().collect(),
            transition_production_rates: [(name("f"), 4.0)].into_iter().collect(),
            place_consumption_rates: [(
                name("f"),
                [(name("x"), 2.0), (name("c"), 3.0)].into_iter().collect(),
            )]
            .into_iter()
            .collect(),
            place_production_rates: [(
                name("f"),
                [(name("y"), 1.5), (name("c"), 2.5)].into_iter().collect(),
            )]
            .into_iter()
            .collect(),
        };

        let v1_data = migrate_petri_net_mass_action_v0_to_v1(v0_data);

        let balanced_system = PetriNetMassActionAnalysis::default().build_system(&model);
        let balanced_analysis = v1_data.balanced.extend_scalars(balanced_system);
        let balanced_expected = expect!([r#"
            dx = -1.5 c x
            dy = 1.5 c x
            dc = 0
        "#]);
        balanced_expected.assert_eq(&balanced_analysis.to_string());

        let unbalanced_system =
            PetriNetUnbalancedMassActionAnalysis::default().build_system(&model);
        let unbalanced_analysis = v1_data.unbalanced.extend_scalars(unbalanced_system);
        let unbalanced_expected = expect!([r#"
            dx = -3.5 c x
            dy = 4 c x
            dc = 0.5 c x
        "#]);
        unbalanced_expected.assert_eq(&unbalanced_analysis.to_string());

        let very_unbalanced_system =
            PetriNetVeryUnbalancedMassActionAnalysis::default().build_system(&model);
        let very_unbalanced_analysis =
            v1_data.very_unbalanced.extend_scalars(very_unbalanced_system);
        let very_unbalanced_expected = expect!([r#"
            dx = -2 c x
            dy = 1.5 c x
            dc = -0.5 c x
        "#]);
        very_unbalanced_expected.assert_eq(&very_unbalanced_analysis.to_string());
    }

    #[test]
    fn stock_flow_mass_action_v0_to_v1_migration() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);

        let v0_data = MassActionProblemData {
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
            equations_data: MassActionEquationsData {
                mass_conservation_type:
                    crate::stdlib::analyses::ode::v0::mass_action::MassConservationType::Balanced,
            },
            transition_rates: [(name("f"), 3.0)].into_iter().collect(),
            transition_consumption_rates: [(name("f"), 1.5)].into_iter().collect(),
            transition_production_rates: [(name("f"), 2.0)].into_iter().collect(),
            place_consumption_rates: HashMap::new(),
            place_production_rates: HashMap::new(),
        };

        let v1_data = migrate_stock_flow_mass_action_v0_to_v1(v0_data);

        let balanced_system = StockFlowMassActionAnalysis::default().build_system(&model);
        let balanced_analysis = v1_data.balanced.extend_scalars(balanced_system);

        let unbalanced_system =
            StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let unbalanced_analysis = v1_data.unbalanced.extend_scalars(unbalanced_system);

        let expected_balanced = expect!([r#"
            dx = -3 x y
            dy = 3 x y
        "#]);
        expected_balanced.assert_eq(&balanced_analysis.to_string());

        let expected_unbalanced = expect!([r#"
            dx = -1.5 x y
            dy = 2 x y
        "#]);
        expected_unbalanced.assert_eq(&unbalanced_analysis.to_string());
    }
}
