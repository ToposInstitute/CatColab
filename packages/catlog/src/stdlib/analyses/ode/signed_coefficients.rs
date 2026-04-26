//! Helper module to build analyses based on signed coefficient matrices.

use indexmap::IndexMap;
use nalgebra::DMatrix;
use num_traits::zero;

use super::Parameter;
use crate::{
    dbl::model::FpDblModel,
    zero::{QualifiedName, rig::Monomial},
};

/// Builder for signed coefficient matrices and analyses based on them.
///
/// Used to construct the [linear](Self::linear_ode_analysis) and
/// [Lotka-Volterra](Self::lotka_volterra_analysis) ODE analyses.
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

    /// Builds the matrix of symbolic coefficients for the given model.
    ///
    /// Returns the coefficient matrix along with an ordered map from object
    /// generators to integer indices.
    pub fn build_matrix(
        &self,
        model: &impl FpDblModel<
            ObType = ObType,
            MorType = MorType,
            Ob = QualifiedName,
            ObGen = QualifiedName,
            MorGen = QualifiedName,
        >,
    ) -> (DMatrix<Parameter<QualifiedName>>, IndexMap<QualifiedName, usize>) {
        let ob_index: IndexMap<_, _> = model
            .ob_generators_with_type(&self.var_ob_type)
            .enumerate()
            .map(|(i, x)| (x, i))
            .collect();

        let n = ob_index.len();
        let mut mat = DMatrix::from_element(n, n, zero());
        for mor_type in self.positive_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                if let (Some(i), Some(j)) = (
                    ob_index.get(&model.mor_generator_dom(&mor)),
                    ob_index.get(&model.mor_generator_cod(&mor)),
                ) {
                    mat[(*j, *i)] += (1.0, Monomial::generator(mor));
                }
            }
        }
        for mor_type in self.negative_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                if let (Some(i), Some(j)) = (
                    ob_index.get(&model.mor_generator_dom(&mor)),
                    ob_index.get(&model.mor_generator_cod(&mor)),
                ) {
                    mat[(*j, *i)] += (-1.0, Monomial::generator(mor));
                }
            }
        }

        (mat, ob_index)
    }
}
