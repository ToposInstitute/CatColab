//! ODE analysis of models of the logic of systems of polynomial ODEs.
use std::collections::HashMap;

use clap::builder::NonEmptyStringValueParser;
use indexmap::IndexMap;
use nalgebra::DVector;
use num_traits::Zero;
#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::{
    dbl::{
        modal::{ModalMorType, ModalObType, ModeApp},
        model::{FpDblModel, ModalDblModel, MutDblModel},
        theory::NonUnital,
    },
    simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem},
    zero::{alg::Polynomial, name, rig::Monomial, QualifiedName},
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
            // TODO: collect_product() is wrong here, we know we're getting
            //          ModalOb::List(List::Symmetric, vec![...])
            //       i.e. **not**
            //          ModalOb::App(ModalOb::List(List::Symmetric, vec![...]))
            // see line 660 of catlog/src/dbl/modal/model.rs
            let inputs = model
                .get_dom(&mor)
                .and_then(|ob| ob.clone().collect_product(None))
                .unwrap_or_default();
            // TODO: only a single output
            let outputs = model
                .get_cod(&mor)
                .and_then(|ob| ob.clone().collect_product(None))
                .unwrap_or_default();
            let term: Monomial<_, _> =
                inputs.iter().map(|ob| (ob.clone().unwrap_generator(), 1)).collect();

            let term: Polynomial<_, _, _> =
                [(Parameter::generator(mor), term.clone())].into_iter().collect();

            // TODO: only a single output
            for output in outputs {
                sys.add_term(output.clone().unwrap_generator(), term.clone());
            }
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
    use crate::stdlib::{models::*, theories::*};

    // (Unsigned) Lotka–Volterra dynamics on a two-level model.
    #[test]
    fn lotka_volterra_equations() {
        let th = Rc::new(th_sym_multicategory());
        let model = lotka_volterra_dynamics(th);
        let sys = PolynomialODEAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dA = A_growth A + BA_interaction AB
            dB = B_growth B + AB_interaction AB + CB_interaction BC
            dC = C_growth C + BC_interaction BC
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // // (Unsigned) Lotka–Volterra dynamics on a two-level model with LaTeX.
    // #[test]
    // fn lotka_volterra_equations_latex() {
    //     let th = Rc::new(th_sym_multicategory());
    //     let model = lotka_volterra_dynamics(th);
    //     let sys = PolynomialODEAnalysis::default().build_system(&model);
    //     let expected = vec![
    //         LatexEquation {
    //             lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} A".to_string(),
    //             rhs: "A_growth A + BA_interaction AB".to_string(),
    //         },
    //         LatexEquation {
    //             lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} B".to_string(),
    //             rhs: "B_growth B + AB_interaction AB + CB interaction BC".to_string(),
    //         },
    //         LatexEquation {
    //             lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} C".to_string(),
    //             rhs: "C_growth C + BC_interaction BC".to_string(),
    //         },
    //     ];
    //     assert_eq!(expected, sys.to_latex_equations());
    // }
}
