//! Kuramoto ODE analsysis of models.

use std::collections::{BTreeMap, HashMap};

use nalgebra::{DMatrix, DVector};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, ODEProblem};
use crate::dbl::{
    model::{FgDblModel, ModalDblModel, ModalOb},
    theory::{ModalMorType, ModalObType},
};
use crate::one::FgCategory;
use crate::simulate::ode::{KuramotoOrder, KuramotoSystem};
use crate::zero::QualifiedName;

/// Data defining a Kuramoto ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "order"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub enum KuramotoProblemData {
    /// Data defining a first-order Kuramoto ODE problem.
    #[serde(rename = "first")]
    FirstOrder(CommonKuramotoProblemData),

    /// Data defining a second-order Kuramoto ODE problem.
    #[serde(rename = "second")]
    SecondOrder {
        /// Data common to any Kuramoto problem.
        #[cfg_attr(feature = "serde", serde(flatten))]
        common: CommonKuramotoProblemData,

        /// Map from object IDs to initial values of angular frequencies.
        #[cfg_attr(feature = "serde", serde(rename = "initialFrequencies"))]
        initial_frequencies: HashMap<QualifiedName, f32>,
    },
}

impl KuramotoProblemData {
    fn common(&self) -> &CommonKuramotoProblemData {
        match self {
            Self::FirstOrder(common) => common,
            Self::SecondOrder { common, .. } => common,
        }
    }

    fn order(&self) -> KuramotoOrder {
        match self {
            Self::FirstOrder(_) => KuramotoOrder::First,
            Self::SecondOrder { .. } => KuramotoOrder::Second,
        }
    }
}

/// Data common to both first- and second-order Kuramoto problems.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct CommonKuramotoProblemData {
    /// Map from morphism IDs to coupling coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "couplingCoefficients"))]
    coupling_coeffs: HashMap<QualifiedName, f32>,

    /// Map from object IDs to damping coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "dampingCoefficients"))]
    damping_coeffs: HashMap<QualifiedName, f32>,

    /// Map from object IDs to forcing parameters (reals).
    #[cfg_attr(feature = "serde", serde(rename = "forcingParameters"))]
    forcing_params: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values of phases.
    #[cfg_attr(feature = "serde", serde(rename = "initialPhases"))]
    initial_phases: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    duration: f32,
}

/// Kuramoto ODE analysis of a model.
pub struct KuramotoAnalysis {
    node_ob_type: ModalObType,
    link_mor_types: Vec<ModalMorType>,
}

impl KuramotoAnalysis {
    /// Constructs a Kuramoto analysis with nodes the objects of given type.
    pub fn new(ob_type: ModalObType) -> Self {
        Self {
            node_ob_type: ob_type,
            link_mor_types: Default::default(),
        }
    }

    /// Adds a type of morphism to be treated as links between nodes.
    pub fn add_link_type(mut self, mor_type: ModalMorType) -> Self {
        self.link_mor_types.push(mor_type);
        self
    }

    /// Creates a Kuramoto system from a model plus numerical data.
    pub fn build_system(
        &self,
        model: &ModalDblModel,
        data: &KuramotoProblemData,
    ) -> ODEAnalysis<KuramotoSystem> {
        let common = data.common();

        let ob_index: BTreeMap<_, _> = model
            .ob_generators_with_type(&self.node_ob_type)
            .enumerate()
            .map(|(i, x)| (x, i))
            .collect();
        let ob_ids = || ob_index.keys();
        let n = ob_index.len();

        let mut coupling_coeffs = DMatrix::from_element(n, n, 0.0f32);
        for mor_type in self.link_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                let coef = common.coupling_coeffs.get(&mor).copied().unwrap_or_default();
                let ModalOb::Generator(dom_id) = model.mor_generator_dom(&mor) else {
                    panic!("Domain should be a generating object");
                };
                let ModalOb::Generator(cod_id) = model.mor_generator_cod(&mor) else {
                    panic!("Codomain should be a generating object");
                };
                let (i, j) = (*ob_index.get(&dom_id).unwrap(), *ob_index.get(&cod_id).unwrap());
                // Coupling matrix is assumed symmetric in the literature.
                coupling_coeffs[(i, j)] += coef;
                coupling_coeffs[(j, i)] += coef;
            }
        }

        let damping_coeffs =
            ob_ids().map(|id| common.damping_coeffs.get(id).copied().unwrap_or_default());
        let forcing_params =
            ob_ids().map(|id| common.forcing_params.get(id).copied().unwrap_or_default());

        let system = KuramotoSystem {
            order: data.order(),
            coupling_coeffs,
            damping_coeffs: DVector::from_iterator(n, damping_coeffs),
            forcing_params: DVector::from_iterator(n, forcing_params),
        };
        let initial_phases =
            ob_ids().map(|id| common.initial_phases.get(id).copied().unwrap_or_default());
        let initial_values = match data {
            KuramotoProblemData::FirstOrder(_) => DVector::from_iterator(n, initial_phases),
            KuramotoProblemData::SecondOrder {
                initial_frequencies,
                ..
            } => {
                let initial_frequencies =
                    ob_ids().map(|id| initial_frequencies.get(id).copied().unwrap_or_default());
                DVector::from_iterator(2 * n, initial_phases.chain(initial_frequencies))
            }
        };
        let problem = ODEProblem::new(system, initial_values).end_time(common.duration);
        ODEAnalysis::new(problem, ob_index)
    }
}
