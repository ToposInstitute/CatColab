//! ODE analysis of models of the logic of systems of polynomial ODEs.
use std::collections::HashMap;

use indexmap::IndexMap;
use nalgebra::DVector;
use num_traits::Zero;
#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::{
    dbl::{
        modal::{List, ModalMorType, ModalObType, ModeApp},
        model::{FpDblModel, ModalDblModel, ModalOb, MutDblModel},
        theory::NonUnital,
    },
    simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem},
    zero::{QualifiedName, alg::Polynomial, name, rig::Monomial},
};

use super::{ODEAnalysis, Parameter};

/// Data defining an unbalanced mass-action ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct PolynomialODEProblemData {
    /// Map from morphism IDs to coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "coefficients"))]
    coefficients: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    pub duration: f32,
}

/// Polynomial ODE analysis.
///
/// The "canonical" analysis for system of polynomial ODEs, namely interpreting
/// them as actual systems of polynomial ODEs.
pub struct PolynomialODEAnalysis {
    /// Object type for variables.
    pub variable_ob_type: ModalObType,
    /// Morphism type for contributions.
    pub contribution_mor_type: ModalMorType,
}

impl Default for PolynomialODEAnalysis {
    fn default() -> Self {
        Self {
            variable_ob_type: ModalObType::new(name("Object")),
            contribution_mor_type: ModeApp::new(name("Multihom")).into(),
        }
    }
}

impl PolynomialODEAnalysis {
    /// Creates a system with symbolic coefficients.
    pub fn build_system(
        &self,
        model: &ModalDblModel<NonUnital>,
    ) -> PolynomialSystem<QualifiedName, Parameter<QualifiedName>, i8> {
        let mut sys = PolynomialSystem::new();

        // Create a variable for each object.
        for ob in model.ob_generators_with_type(&self.variable_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }

        // Create a monomial for each morphism.
        for mor in model.mor_generators_with_type(&self.contribution_mor_type) {
            let input = model.get_dom(&mor).unwrap();
            let inputs: &Vec<ModalOb> = match input {
                ModalOb::List(List::Symmetric, v) => v,
                _ => &Vec::new(),
            };
            let output = model.get_cod(&mor).unwrap();
            let term: Monomial<_, _> =
                inputs.iter().map(|ob| (ob.clone().unwrap_generator(), 1)).collect();

            let term: Polynomial<_, _, _> =
                [(Parameter::generator(mor), term.clone())].into_iter().collect();

            // TODO: only a single output
            sys.add_term(output.clone().unwrap_generator(), term.clone());
        }

        sys.normalize()
    }
}

/// Builds the numerical ODE analysis for a system of polynomial ODEs whose scalars have been substituted.
pub fn polynomial_ode_analysis(
    sys: PolynomialSystem<QualifiedName, f32, i8>,
    data: PolynomialODEProblemData,
) -> ODEAnalysis<NumericalPolynomialSystem<i8>> {
    let ob_index: IndexMap<_, _> =
        sys.components.keys().cloned().enumerate().map(|(i, x)| (x, i)).collect();
    let n = ob_index.len();

    let initial_values = ob_index
        .keys()
        .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
    let x0 = DVector::from_iterator(n, initial_values);

    let num_sys = sys.to_numerical();
    let problem = ODEProblem::new(num_sys, x0).end_time(data.duration);

    ODEAnalysis::new(problem, ob_index)
}

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::{
        simulate::ode::LatexEquation,
        stdlib::{models::*, theories::*},
    };

    // (Unsigned) Lotka–Volterra dynamics on a two-level model.
    #[test]
    fn lotka_volterra_equations() {
        let th = Rc::new(th_sym_multicategory());
        let model = lotka_volterra_dynamics(th);
        let sys = PolynomialODEAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dA = (A_growth) A + (BA_interaction) A B
            dB = (AB_interaction) A B + (B_growth) B + (CB_interaction) B C
            dC = (BC_interaction) B C + (C_growth) C
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // (Unsigned) Lotka–Volterra dynamics on a two-level model with LaTeX.
    #[test]
    fn lotka_volterra_equations_latex() {
        let th = Rc::new(th_sym_multicategory());
        let model = lotka_volterra_dynamics(th);
        let sys = PolynomialODEAnalysis::default().build_system(&model);
        let expected = vec![
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} A".to_string(),
                rhs: "(A_growth) A + (BA_interaction) A B".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} B".to_string(),
                rhs: "(AB_interaction) A B + (B_growth) B + (CB_interaction) B C".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} C".to_string(),
                rhs: "(BC_interaction) B C + (C_growth) C".to_string(),
            },
        ];
        assert_eq!(expected, sys.to_latex_equations());
    }
}
