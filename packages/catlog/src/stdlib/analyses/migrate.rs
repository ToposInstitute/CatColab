//! Migrations from v0 to v1 for analyses.

use crate::stdlib::analyses::v0;
use crate::stdlib::analyses::v1::ode::*;

/// Migration for problem data for linear ODE.
pub fn migrate_linear_ode_v0_to_v1(
    v0: v0::ode::linear_ode::LinearODEProblemData,
) -> LinearODEProblemData {
    LinearODEProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values,
            duration: v0.duration,
        },
        parameter_data: LinearODEParameterData { coefficients: v0.coefficients },
    }
}

/// Migration for problem data for Lotka-Volterra.
pub fn migrate_lotka_volterra_v0_to_v1(
    v0: v0::ode::lotka_volterra::LotkaVolterraProblemData,
) -> LotkaVolterraProblemData {
    LotkaVolterraProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values,
            duration: v0.duration,
        },
        parameter_data: LotkaVolterraParameterData {
            interaction_coeffs: v0.interaction_coeffs,
            growth_rates: v0.growth_rates,
        },
    }
}

/// Migration for problem data for polynomial ODE.
pub fn migrate_polynomial_ode_v0_to_v1(
    v0: v0::ode::polynomial_ode::PolynomialODEProblemData,
) -> PolynomialODEProblemData {
    PolynomialODEProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values,
            duration: v0.duration,
        },
        parameter_data: PolynomialODEParameterData { coefficients: v0.coefficients },
    }
}

fn migrate_mass_action_variant(
    v0: v0::ode::mass_action::MassConservationType,
) -> MassActionVariant {
    match v0 {
        v0::ode::mass_action::MassConservationType::Balanced => MassActionVariant::Balanced,
        v0::ode::mass_action::MassConservationType::Unbalanced(rate_granularity) => {
            match rate_granularity {
                v0::ode::mass_action::RateGranularity::PerTransition => {
                    MassActionVariant::Unbalanced
                }
                v0::ode::mass_action::RateGranularity::PerPlace => MassActionVariant::PerPlace,
            }
        }
    }
}

/// Migration for problem data for mass-action on a Petri net.
pub fn migrate_petri_net_mass_action_v0_to_v1(
    v0: v0::ode::mass_action::MassActionProblemData,
) -> MassActionProblemData {
    let balanced = BalancedMassActionProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values.clone(),
            duration: v0.duration,
        },
        parameter_data: BalancedMassActionParameterData { rates: v0.transition_rates },
    };
    let unbalanced = UnbalancedMassActionProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values.clone(),
            duration: v0.duration,
        },
        parameter_data: UnbalancedMassActionParameterData {
            consumption_rates: v0.transition_consumption_rates,
            production_rates: v0.transition_production_rates,
        },
    };
    let per_place = PerPlaceMassActionProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values,
            duration: v0.duration,
        },
        parameter_data: PerPlaceMassActionParameterData {
            consumption_rates: v0.place_consumption_rates,
            production_rates: v0.place_production_rates,
        },
    };

    MassActionProblemData {
        variant: migrate_mass_action_variant(v0.equations_data.mass_conservation_type),
        balanced,
        unbalanced,
        per_place,
    }
}

/// Migration for problem data for mass-action on a stock-flow diagram.
pub fn migrate_stock_flow_mass_action_v0_to_v1(
    v0: v0::ode::mass_action::MassActionProblemData,
) -> RestrictedMassActionProblemData {
    let balanced = BalancedMassActionProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values.clone(),
            duration: v0.duration,
        },
        parameter_data: BalancedMassActionParameterData { rates: v0.transition_rates },
    };
    let unbalanced = UnbalancedMassActionProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values.clone(),
            duration: v0.duration,
        },
        parameter_data: UnbalancedMassActionParameterData {
            consumption_rates: v0.transition_consumption_rates,
            production_rates: v0.transition_production_rates,
        },
    };
    RestrictedMassActionProblemData {
        variant: migrate_mass_action_variant(v0.equations_data.mass_conservation_type),
        balanced,
        unbalanced,
    }
}

#[cfg(test)]
mod test {
    use std::{collections::HashMap, rc::Rc};

    use super::*;
    use crate::{
        stdlib::{
            analyses::ode::{
                LinearODEAnalysis, LotkaVolterraAnalysis, ODESemanticsAnalysis,
                PetriNetBalancedMassActionAnalysis, PetriNetPerPlaceMassActionAnalysis,
                PetriNetUnbalancedMassActionAnalysis, PolynomialODEAnalysis,
                StockFlowBalancedMassActionAnalysis, StockFlowUnbalancedMassActionAnalysis,
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

        let v0_data = v0::ode::linear_ode::LinearODEProblemData {
            coefficients: [(name("positive"), 3.0), (name("negative"), 2.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let v1_data = migrate_linear_ode_v0_to_v1(v0_data);

        let system = LinearODEAnalysis::default().build_system(&model);
        let analysis = v1_data.parameter_data.extend_scalars(system);
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

        let v0_data = v0::ode::lotka_volterra::LotkaVolterraProblemData {
            interaction_coeffs: [(name("positive"), 1.0), (name("negative"), 1.0)]
                .into_iter()
                .collect(),
            growth_rates: [(name("x"), 2.0), (name("y"), -1.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let v1_data = migrate_lotka_volterra_v0_to_v1(v0_data);

        let system = LotkaVolterraAnalysis::default().build_system(&model);
        let analysis = v1_data.parameter_data.extend_scalars(system);
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

        let v0_data = v0::ode::polynomial_ode::PolynomialODEProblemData {
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
        let analysis = v1_data.parameter_data.extend_scalars(system);
        let expected = expect!([r#"
            dA = A - 2 A B
            dB = 1.5 A B + 2 B - 3 B C
            dC = 3 B C - 2 C
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    #[test]
    fn petri_net_mass_action_v0_to_v1_migration() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);

        let v0_data = v0::ode::mass_action::MassActionProblemData {
            initial_values: [(name("x"), 1.0), (name("y"), 1.5), (name("c"), 2.0)]
                .into_iter()
                .collect(),
            duration: 10.0,
            equations_data: v0::ode::mass_action::MassActionEquationsData {
                mass_conservation_type: v0::ode::mass_action::MassConservationType::Balanced,
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

        let balanced_system = PetriNetBalancedMassActionAnalysis::default().build_system(&model);
        let balanced_analysis = v1_data.balanced.parameter_data.extend_scalars(balanced_system);
        let balanced_expected = expect!([r#"
            dx = -1.5 c x
            dy = 1.5 c x
            dc = 0
        "#]);
        balanced_expected.assert_eq(&balanced_analysis.to_string());

        let unbalanced_system =
            PetriNetUnbalancedMassActionAnalysis::default().build_system(&model);
        let unbalanced_analysis =
            v1_data.unbalanced.parameter_data.extend_scalars(unbalanced_system);
        let unbalanced_expected = expect!([r#"
            dx = -3.5 c x
            dy = 4 c x
            dc = 0.5 c x
        "#]);
        unbalanced_expected.assert_eq(&unbalanced_analysis.to_string());

        let per_place_system = PetriNetPerPlaceMassActionAnalysis::default().build_system(&model);
        let per_place_analysis = v1_data.per_place.parameter_data.extend_scalars(per_place_system);
        let per_place_expected = expect!([r#"
            dx = -2 c x
            dy = 1.5 c x
            dc = -0.5 c x
        "#]);
        per_place_expected.assert_eq(&per_place_analysis.to_string());
    }

    #[test]
    fn stock_flow_mass_action_v0_to_v1_migration() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);

        let v0_data = v0::ode::mass_action::MassActionProblemData {
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
            equations_data: v0::ode::mass_action::MassActionEquationsData {
                mass_conservation_type:
                    crate::stdlib::analyses::ode::v0::ode::mass_action::MassConservationType::Balanced,
            },
            transition_rates: [(name("f"), 3.0)].into_iter().collect(),
            transition_consumption_rates: [(name("f"), 1.5)].into_iter().collect(),
            transition_production_rates: [(name("f"), 2.0)].into_iter().collect(),
            place_consumption_rates: HashMap::new(),
            place_production_rates: HashMap::new(),
        };

        let v1_data = migrate_stock_flow_mass_action_v0_to_v1(v0_data);

        let balanced_system = StockFlowBalancedMassActionAnalysis::default().build_system(&model);
        let balanced_analysis = v1_data.balanced.parameter_data.extend_scalars(balanced_system);

        let unbalanced_system =
            StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let unbalanced_analysis =
            v1_data.unbalanced.parameter_data.extend_scalars(unbalanced_system);

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
