//! Mass-action ODE analysis of models.
//!
//! Such ODEs are based on the *law of mass action* familiar from chemistry and
//! mathematical epidemiology. Here, however, we also consider a generalised version
//! where we do not require that mass be preserved. This allows the construction
//! of systems of arbitrary polynomial (first-order) ODEs.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::stdlib::analyses::ode::ODESemanticsGeneralProblemData;
pub use crate::stdlib::analyses::ode::mass_action::v1::{balanced::*, per_place::*, unbalanced::*};

#[allow(dead_code)]
mod v0;
mod v1;

// For backwards compatibility to when there was a *single* mass-action semantics with three
// internal variants, we give here some wrappers that will be useful for migration.

/// The variants of mass-action.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[derive(PartialEq, Eq, Hash, Clone)]
pub enum MassActionVariant {
    /// The balanced (i.e. classical) case.
    Balanced,
    /// The unbalanced ("per-flow"/"per-transition") case.
    Unbalanced,
    /// The per-place case.
    PerPlace,
}

/// For `migrate_stock_flow_mass_action_v0_to_v1` to have a well-defined return type, we unify both
/// balanced and unbalanced mass-action semantics into a single struct.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[derive(Clone)]
pub struct RestrictedMassActionProblemData {
    /// The mass-action variant of interest, which may be switched at any point.
    pub variant: MassActionVariant,
    /// Problem data for balanced mass-action.
    pub balanced: BalancedMassActionProblemData,
    /// Problem data for unbalanced mass-action.
    pub unbalanced: UnbalancedMassActionProblemData,
}

/// For `migrate_petri_net_mass_action_v0_to_v1` to have a well-defined return type, we unify the
/// all three mass-action semantics into a single struct.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[derive(Clone)]
pub struct MassActionProblemData {
    /// The mass-action variant of interest, which may be switched at any point.
    pub variant: MassActionVariant,
    /// Problem data for balanced mass-action.
    pub balanced: BalancedMassActionProblemData,
    /// Problem data for unbalanced mass-action.
    pub unbalanced: UnbalancedMassActionProblemData,
    /// Problem data for per-place mass-action.
    #[cfg_attr(feature = "serde", serde(rename = "perPlace"))]
    pub per_place: PerPlaceMassActionProblemData,
}

/// Migration for part of the problem data for mass-action equations.
pub fn migrate_mass_action_variant(v0: v0::mass_action::MassConservationType) -> MassActionVariant {
    match v0 {
        v0::mass_action::MassConservationType::Balanced => MassActionVariant::Balanced,
        v0::mass_action::MassConservationType::Unbalanced(rate_granularity) => {
            match rate_granularity {
                v0::mass_action::RateGranularity::PerTransition => MassActionVariant::Unbalanced,
                v0::mass_action::RateGranularity::PerPlace => MassActionVariant::PerPlace,
            }
        }
    }
}

/// Migration for problem data for mass-action on a Petri net.
pub fn migrate_petri_net_mass_action_v0_to_v1(
    v0: v0::mass_action::MassActionProblemData,
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
    v0: v0::mass_action::MassActionProblemData,
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
                ODESemanticsAnalysis, ODESemanticsScalarExtension,
                PetriNetBalancedMassActionAnalysis, PetriNetPerPlaceMassActionAnalysis,
                PetriNetUnbalancedMassActionAnalysis, StockFlowBalancedMassActionAnalysis,
                StockFlowUnbalancedMassActionAnalysis,
            },
            backward_link, catalyzed_reaction, th_category_links, th_sym_monoidal_category,
        },
        zero::name,
    };
    use expect_test::expect;

    #[test]
    fn petri_net_mass_action_v0_to_v1_migration() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);

        let v0_data = v0::mass_action::MassActionProblemData {
            initial_values: [(name("x"), 1.0), (name("y"), 1.5), (name("c"), 2.0)]
                .into_iter()
                .collect(),
            duration: 10.0,
            equations_data: v0::mass_action::MassActionEquationsData {
                mass_conservation_type: v0::mass_action::MassConservationType::Balanced,
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

        let v0_data = v0::mass_action::MassActionProblemData {
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
            equations_data: v0::mass_action::MassActionEquationsData {
                mass_conservation_type: v0::mass_action::MassConservationType::Balanced,
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
