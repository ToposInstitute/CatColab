//! ODE analysis of models of the logic of systems of polynomial ODEs.
use std::{collections::HashMap, fmt};

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
    /// Morphism type for positive contributions.
    pub positive_contribution_mor_type: ModalMorType,
    /// Morphism type for negative contributions.
    pub negative_contribution_mor_type: ModalMorType,
}

impl Default for PolynomialODEAnalysis {
    fn default() -> Self {
        Self {
            variable_ob_type: ModalObType::new(name("State")),
            positive_contribution_mor_type: ModeApp::new(name("Contribution")).into(),
            negative_contribution_mor_type: ModeApp::new(name("NegativeContribution")).into(),
        }
    }
}

impl PolynomialODEAnalysis {
    /// Creates a `PolynomialSystem` with symbolic coefficients of type `QualifiedName`.
    pub fn build_system(
        &self,
        model: &ModalDblModel<NonUnital>,
    ) -> PolynomialSystem<QualifiedName, Parameter<QualifiedName>, i8> {
        // The default is to build a system whose parameters are in bijective correspondence
        // with morphisms, given by using the `QualifiedName` of the morphism as the parameter
        // generator. We thus build the graph of the identity function to pass as the HashMap
        // of associated parameters.
        let mut associated_parameters: HashMap<QualifiedName, QualifiedName> = HashMap::new();
        for mor in model.mor_generators_with_type(&self.positive_contribution_mor_type) {
            associated_parameters.insert(mor.clone(), mor.clone());
        }
        for mor in model.mor_generators_with_type(&self.negative_contribution_mor_type) {
            associated_parameters.insert(mor.clone(), mor.clone());
        }

        self.build_system_custom_parameters::<QualifiedName>(model, associated_parameters)
    }

    /// Creates a `PolynomialSystem` with symbolic coefficients of some generic type.
    ///
    /// When constructing a system as a derived model from another model (as in e.g. `mass_action`),
    /// it is not necessarily the case that each morphism will give rise to a unique parameter. This
    /// function allows for the construction of a `PolynomialSystem<_ , Parameter<T>, _>` using some
    /// specified `HashMap<QualifiedName, T>` that describes how to associate parameters to morphisms.
    pub fn build_system_custom_parameters<T: Ord + Clone + fmt::Display>(
        &self,
        model: &ModalDblModel<NonUnital>,
        associated_parameters: HashMap<QualifiedName, T>,
    ) -> PolynomialSystem<QualifiedName, Parameter<T>, i8> {
        let mut sys = PolynomialSystem::new();

        // Create a variable for each object.
        for ob in model.ob_generators_with_type(&self.variable_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }

        // Every morphism will give a term, i.e. a pair consisting of a monomial and a parameter.
        // Although the *monomial* depends only on the input objects to the morphism, the *parameter*
        // might be described by external data. For example, multiple morphisms might share the same
        // parameter.
        //
        // This closure builds a term to add to the `PolynomialSystem` given a morphism and the
        // hash map `associated_parameters`.
        let make_term = |mor: QualifiedName| {
            // Find the inputs and output of the morphism.
            let (Some(ModalOb::List(_, inputs)), Some(output)) =
                (model.get_dom(&mor), model.get_cod(&mor))
            else {
                return None;
            };

            // Construct the monomial given by the product of all of the inputs.
            let monomial: Monomial<_, _> =
                inputs.iter().cloned().map(|ob| (ob.unwrap_generator(), 1)).collect();
            // Construct the term given by the monomial and the parameter from `associated_parameters`.
            let term: Polynomial<_, _, _> = [(
                Parameter::generator(associated_parameters.get(&mor).unwrap().clone()),
                monomial.clone(),
            )]
            .into_iter()
            .collect();

            Some((output.clone().unwrap_generator(), term))
        };

        // Add a monomial with positive sign for each positive contribution.
        for mor in model.mor_generators_with_type(&self.positive_contribution_mor_type) {
            if let Some((var, term)) = make_term(mor) {
                sys.add_term(var, term);
            }
        }
        // Add a monomial with negative sign for each negative contribution.
        for mor in model.mor_generators_with_type(&self.negative_contribution_mor_type) {
            if let Some((var, term)) = make_term(mor) {
                sys.add_term(var, -term);
            }
        }

        sys.normalize()
    }
}

/// Substitutes numerical rate coefficients into a symbolic mass-action system.
pub fn extend_polynomial_ode_scalars(
    sys: PolynomialSystem<QualifiedName, Parameter<QualifiedName>, i8>,
    data: &PolynomialODEProblemData,
) -> PolynomialSystem<QualifiedName, f32, i8> {
    let sys = sys.extend_scalars(|poly| {
        poly.eval(|mor| data.coefficients.get(mor).cloned().unwrap_or_default())
    });

    sys.normalize()
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
        tt,
    };

    /// (Unsigned) Lotka–Volterra dynamics on a two-level model.
    #[test]
    fn unsigned_lotka_volterra_equations() {
        let th = Rc::new(th_polynomial_ode_system());
        let model = unsigned_lotka_volterra_dynamics(th);
        let sys = PolynomialODEAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dA = A_growth A + BA_interaction A B
            dB = AB_interaction A B + B_growth B + CB_interaction B C
            dC = BC_interaction B C + C_growth C
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    /// Lotka–Volterra dynamics on a two-level model with LaTeX.
    #[test]
    fn lotka_volterra_equations_latex() {
        let th = Rc::new(th_signed_polynomial_ode_system());
        let model = signed_lotka_volterra_dynamics(th);
        let sys = PolynomialODEAnalysis::default().build_system(&model);
        let expected = vec![
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} A".to_string(),
                rhs: "A_growth \\cdot A - BA_interaction \\cdot A \\cdot B".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} B".to_string(),
                rhs: "AB_interaction \\cdot A \\cdot B + B_growth \\cdot B".to_string(),
            },
        ];
        assert_eq!(expected, sys.to_latex_equations());
    }

    /// DoubleTT elaboration from text.
    #[test]
    fn ode_system_from_text() {
        let th = Rc::new(th_polynomial_ode_system());
        let model = tt::modelgen::Model::from_text(
            &th.into(),
            "[
                X : State,
                Y : State,
                A : State,
                f : Contribution[[X, Y, Y], A],
                g : Contribution[[X, X], Y],
                h : Contribution[[A], X],
            ]",
        );
        let model = model.unwrap().as_modal_non_unital().unwrap();
        let sys = PolynomialODEAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dX = h A
            dY = g X^2
            dA = f X Y^2
        "#]);
        expected.assert_eq(&sys.to_string());
    }
}
