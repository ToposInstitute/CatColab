//! Version 0 of `mass_action`, before the addition of `ode_semantics`.

use std::collections::HashMap;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::zero::QualifiedName;

/// There are three types of mass-action semantics, each more expressive than the previous:
/// - balanced
/// - unbalanced (rates per transition)
/// - unbalanced (rates per place)
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Copy)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "type", content = "granularity"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum MassConservationType {
    /// Mass is conserved.
    Balanced,
    /// Mass is not conserved.
    Unbalanced(RateGranularity),
}

/// When mass is not necessarily conserved, consumption/production rate parameters
/// can be set either *per transition* or *per place*.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Copy)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum RateGranularity {
    /// Each flow (transition) gets assigned a single consumption and single production rate.
    PerTransition,
    /// Each flow (transition) gets assigned a consumption rate for each input stock (place) and
    /// a production rate for each output stock (place).
    PerPlace,
}

/// Now, corresponding to each term of `MassConvervationType`, we have different
/// terms for `MassActionParameter`. Parameters in the generated polynomial equations
/// are *undirected* in the balanced case and *directed* in the unbalanced case.
/// Parameters for the usual ("balanced") mass-action semantics, where each flow simply has a rate.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum MassActionParameter {
    /// If mass is conserved, we don't need to worry whether a flow is incoming or outgoing.
    Balanced {
        /// Since there is no direction, the rate parameter corresponds to a single transition.
        flow: QualifiedName,
    },
    /// If mass is not conserved, then we need to know whether a flow is incoming or outgoing.
    Unbalanced {
        /// The direction of the flow.
        direction: Direction,
        /// The structure of the rate parameter can be either per transition or per place.
        parameter: RateParameter,
    },
}

/// Depending on the rate granularity, the parameters are specified by different structures.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum RateParameter {
    /// For per flow rates, we simply need to know the associated flow.
    PerTransition {
        /// The flow to which we associate the rate parameter.
        flow: QualifiedName,
    },
    /// For per stock rates, we need to know both the transition and the corresponding
    /// input/output stock.
    PerPlace {
        /// The flow whose input/output objects we wish to associate rate parameters.
        flow: QualifiedName,
        /// The input/output stock to which we associate the rate parameter.
        stock: QualifiedName,
    },
}

/// The associated direction of a "flow" term. Note that this is *opposite* from
/// the terminology of "input" and "output", i.e. a flow A=>B gives rise to an
/// *incoming flow to B* and an *outgoing flow from A*.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum Direction {
    /// The parameter corresponds to an incoming flow to a specific output.
    IncomingFlow,
    /// The parameter corresponds to an outgoing flow to a specific input.
    OutgoingFlow,
}

/// Data defining mass-action ODE equations for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[derive(Clone)]
pub struct MassActionEquationsData {
    /// Whether or not mass is conserved.
    #[cfg_attr(feature = "serde", serde(rename = "massConservationType"))]
    pub mass_conservation_type: MassConservationType,
}

/// Data defining a mass-action problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct MassActionProblemData {
    /// Data used for generating the equations (namely, whether or not mass is conserved).
    #[cfg_attr(feature = "serde", serde(rename = "equationsData"))]
    pub(crate) equations_data: MassActionEquationsData,

    /// Map from morphism IDs to consumption rate coefficients (non-negative reals),
    /// for the balanced per transition case.
    /// N.B. This is renamed to "rates" in catlog-wasm for backwards compatibility.
    #[cfg_attr(feature = "serde", serde(rename = "rates"))]
    pub(crate) transition_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to consumption rate coefficients (non-negative reals),
    /// for the unbalanced per transition case.
    #[cfg_attr(feature = "serde", serde(rename = "transitionConsumptionRates"))]
    pub(crate) transition_consumption_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to production rate coefficients (non-negative reals),
    /// for the unbalanced per transition case.
    #[cfg_attr(feature = "serde", serde(rename = "transitionProductionRates"))]
    pub(crate) transition_production_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to (map from input objects to consumption rate coefficients),
    /// for the unbalanced per place case (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "placeConsumptionRates"))]
    pub(crate) place_consumption_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from morphism IDs to (map from output objects to production rate coefficients),
    /// for the unbalanced per place case (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "placeProductionRates"))]
    pub(crate) place_production_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from object IDs to initial values (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub(crate) initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    pub(crate) duration: f32,
}
