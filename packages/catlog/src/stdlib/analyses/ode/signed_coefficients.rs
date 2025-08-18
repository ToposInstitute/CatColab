//! Helper module to build analyses based on signed coefficient matrices.

use nalgebra::DMatrix;

use std::collections::{BTreeMap, HashMap};
use std::hash::Hash;

use crate::dbl::model::FgDblModel;

/** Builder for signed coefficient matrices and analyses based on them.

Used to construct the [linear](Self::linear_ode_analysis) and
[Lotka-Volterra](Self::lotka_volterra_analysis) ODE analyses.
 */
pub struct SignedCoefficientBuilder<ObType, MorType> {
    var_ob_type: ObType,
    positive_mor_types: Vec<MorType>,
    negative_mor_types: Vec<MorType>,
}

impl<ObType, MorType> SignedCoefficientBuilder<ObType, MorType> {
    /// Creates a new builder for the given object type.
    pub fn new(var_ob_type: ObType) -> Self {
        Self {
            var_ob_type,
            positive_mor_types: Vec::new(),
            negative_mor_types: Vec::new(),
        }
    }

    /// Adds a morphism type defining a positive interaction between objects.
    pub fn add_positive(mut self, mor_type: MorType) -> Self {
        self.positive_mor_types.push(mor_type);
        self
    }

    /// Adds a morphism type defining a negative interaction between objects.
    pub fn add_negative(mut self, mor_type: MorType) -> Self {
        self.negative_mor_types.push(mor_type);
        self
    }

    /** Builds the matrix of coefficients for the given model.

    Returns the coefficient matrix along with an ordered map from object
    generators to integer indices.
     */
    pub fn build_matrix<Id>(
        &self,
        model: &impl FgDblModel<ObType = ObType, MorType = MorType, Ob = Id, ObGen = Id, MorGen = Id>,
        coeffs: &HashMap<Id, f32>,
    ) -> (DMatrix<f32>, BTreeMap<Id, usize>)
    where
        Id: Eq + Clone + Hash + Ord,
    {
        let ob_index: BTreeMap<_, _> = model
            .ob_generators_with_type(&self.var_ob_type)
            .enumerate()
            .map(|(i, x)| (x, i))
            .collect();

        let n = ob_index.len();
        let mut mat = DMatrix::from_element(n, n, 0.0f32);
        for mor_type in self.positive_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.mor_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.mor_generator_cod(&mor)).unwrap();
                mat[(j, i)] += coeffs.get(&mor).copied().unwrap_or_default();
            }
        }
        for mor_type in self.negative_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.mor_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.mor_generator_cod(&mor)).unwrap();
                mat[(j, i)] -= coeffs.get(&mor).copied().unwrap_or_default();
            }
        }

        (mat, ob_index)
    }
}
