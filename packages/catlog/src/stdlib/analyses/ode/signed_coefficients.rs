//! Helper module to build analyses based on signed coefficient matrices.

use std::{fmt::Debug, hash::Hash};

use indexmap::IndexMap;
use nalgebra::DMatrix;
use num_traits::Zero;

use crate::{
    dbl::model::FgDblModel,
    zero::{alg::Polynomial, rig::Monomial},
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

/// Symbolic parameter in polynomial system.
pub type Parameter<Id> = Polynomial<Id, f32, u8>;

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
    pub fn build_matrix<Id>(
        &self,
        model: &impl FgDblModel<ObType = ObType, MorType = MorType, Ob = Id, ObGen = Id, MorGen = Id>,
    ) -> (DMatrix<Parameter<Id>>, IndexMap<Id, usize>)
    where
        Id: Eq + Clone + Hash + Ord + Debug + 'static,
    {
        let ob_index: IndexMap<_, _> = model
            .ob_generators_with_type(&self.var_ob_type)
            .enumerate()
            .map(|(i, x)| (x, i))
            .collect();

        let n = ob_index.len();
        let mut mat = DMatrix::from_element(n, n, Parameter::<Id>::zero());
        for mor_type in self.positive_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.mor_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.mor_generator_cod(&mor)).unwrap();
                mat[(j, i)] += (1.0, Monomial::generator(mor));
            }
        }
        for mor_type in self.negative_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.mor_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.mor_generator_cod(&mor)).unwrap();
                mat[(j, i)] += (-1.0, Monomial::generator(mor));
            }
        }

        (mat, ob_index)
    }
}
