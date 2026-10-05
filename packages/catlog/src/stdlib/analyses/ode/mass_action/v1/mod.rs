// Because Petri nets and stock-flow diagrams are different types of models (unital modal and
// discrete tabulator, respectively), we need a different structs for each one, since to implement
// `ODESemantics` we need to specify a `ModelType`. In particular, they will need different
// implementations of `ODESemanticsAnalysis::build_system_builder`. Furthermore, we implement the
// corresponding "unbalanced" semantics for each.
//
// For Petri nets, each transition gives a positive contribution to each term corresponding to one
// of its outputs, and a negative contribution to each term corresponding to one of its inputs. For
// example, a single transition T: [a,b] -> [x,y] will give four contributions, namely
//
// - two positive contributions:
//      (ab -> x , ab -> y)
//
// - two negative contributions:
//      (ab -> a , ab -> b).
//
// The variations of mass-action determine the coefficients of these contributions:
//
// - In the *balanced* (i.e. classical) case, all four contributions will have the same coefficient.
//
// - In the *unbalanced* (per-transition) case, the two positive contributions will have the same
//   coefficient (the "production rate" of the transition) and the two negative contributions will
//   have the same coefficient (the "consumption rate" of the transition).
//
// - In the *per-place* case, the production (resp. consumption) rates from the unbalanced case are
//   now potentially distinct, i.e. each coefficient depends on a *pair* (transition, place).
//
// For stock-flow diagrams, each flow gives a positive contribution to the term corresponding to its
// output, and a negative contribution to the term corresponding to its input; the term is given by
// the product of the input with the sources of all incoming links. The balanced and unbalanced
// cases are analogous to those for Petri nets (by thinking of a flow as a single-input and
// single-output transition).

use std::collections::HashMap;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::stdlib::analyses::ode::{ODESemanticsGeneralProblemData, mass_action::v0};

pub mod balanced;
pub mod per_place;
pub mod unbalanced;

pub use balanced::*;
pub use per_place::*;
pub use unbalanced::*;

/// Data for a numerical mass-action system, consisting of all three possible variants along with a
/// (changeable) toggle (`variant`) to record which variant to use in any analysis.
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

/// Migration for problem data for mass-action.
pub fn migrate_problem_data_v0_to_v1(v0: v0::MassActionProblemData) -> MassActionProblemData {
    let general_data = ODESemanticsGeneralProblemData {
        initial_values: v0.initial_values,
        duration: v0.duration,
    };
    let balanced = BalancedMassActionProblemData {
        general_data: general_data.clone(),
        parameter_data: BalancedMassActionParameterData { rates: v0.transition_rates },
    };
    let unbalanced = UnbalancedMassActionProblemData {
        general_data: general_data.clone(),
        parameter_data: UnbalancedMassActionParameterData {
            consumption_rates: v0.transition_consumption_rates,
            production_rates: v0.transition_production_rates,
        },
    };
    let per_place = PerPlaceMassActionProblemData {
        general_data: general_data.clone(),
        parameter_data: PerPlaceMassActionParameterData {
            consumption_rates: v0.place_consumption_rates,
            production_rates: v0.place_production_rates,
        },
    };
    MassActionProblemData {
        variant: migrate_variant_v0_to_v1(v0.equations_data.mass_conservation_type),
        balanced,
        unbalanced,
        per_place,
    }
}

/// Migration for equations data for mass-action.
pub fn migrate_equations_data_v0_to_v1(v0: v0::MassActionEquationsData) -> MassActionProblemData {
    MassActionProblemData {
        variant: migrate_variant_v0_to_v1(v0.mass_conservation_type),
        balanced: BalancedMassActionProblemData {
            general_data: ODESemanticsGeneralProblemData::new(),
            parameter_data: BalancedMassActionParameterData { rates: HashMap::new() },
        },
        unbalanced: UnbalancedMassActionProblemData {
            general_data: ODESemanticsGeneralProblemData::new(),
            parameter_data: UnbalancedMassActionParameterData {
                consumption_rates: HashMap::new(),
                production_rates: HashMap::new(),
            },
        },
        per_place: PerPlaceMassActionProblemData {
            general_data: ODESemanticsGeneralProblemData::new(),
            parameter_data: PerPlaceMassActionParameterData {
                consumption_rates: HashMap::new(),
                production_rates: HashMap::new(),
            },
        },
    }
}

/// Migration for part of the problem data for mass-action equations.
pub fn migrate_variant_v0_to_v1(v0: v0::MassConservationType) -> MassActionVariant {
    match v0 {
        v0::MassConservationType::Balanced => MassActionVariant::Balanced,
        v0::MassConservationType::Unbalanced(rate_granularity) => match rate_granularity {
            v0::RateGranularity::PerTransition => MassActionVariant::Unbalanced,
            v0::RateGranularity::PerPlace => MassActionVariant::PerPlace,
        },
    }
}
