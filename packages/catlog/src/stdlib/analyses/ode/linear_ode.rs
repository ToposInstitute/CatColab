//! Constant-coefficient linear first-order ODE analysis of models.

use std::collections::HashMap;
use std::fmt;
use std::rc::Rc;

use indexmap::IndexMap;
use nalgebra::DVector;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, Parameter};
use crate::dbl::modal::List;
use crate::dbl::model::{FpDblModel, ModalDblModel, ModalOb, MutDblModel};
use crate::one::Path;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::stdlib::analyses::ode::PolynomialODEAnalysis;
use crate::stdlib::th_signed_polynomial_ode_system;
use crate::zero::name;
use crate::{dbl::model::DiscreteDblModel, one::QualifiedPath, zero::QualifiedName};

/// Parameters in the linear equations correspond only to morphisms.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum LinearODEParameter {
    /// The parameter associated to a morphism.
    Parameter {
        /// The morphism.
        morphism: QualifiedName,
    },
}

impl fmt::Display for LinearODEParameter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Parameter { morphism } => {
                write!(f, "Parameter({})", morphism)
            }
        }
    }
}

/// Linear ODE analysis for causal loop diagrams (CLDs).
pub struct CLDLinearODEAnalysis {
    /// Object type for variables.
    pub var_ob_type: QualifiedName,
    /// Morphism type for positive links.
    pub pos_link_type: QualifiedPath,
    /// Morphism type for negative links.
    pub neg_link_type: QualifiedPath,
}

impl Default for CLDLinearODEAnalysis {
    fn default() -> Self {
        let ob_type = name("Object");
        Self {
            var_ob_type: ob_type.clone(),
            pos_link_type: Path::Id(ob_type.clone()),
            neg_link_type: Path::single(name("Negative")),
        }
    }
}

impl CLDLinearODEAnalysis {
    /// Creates a linear system with symbolic rate coefficients.
    ///
    /// A system of ODEs for building arbitrary linear ODEs from CLDs.
    pub fn build_system(
        &self,
        model: &DiscreteDblModel,
    ) -> PolynomialSystem<QualifiedName, Parameter<LinearODEParameter>, i8> {
        let ode_theory = Rc::new(th_signed_polynomial_ode_system());
        let mut ode_model = ModalDblModel::new(ode_theory);

        let ode_analysis = PolynomialODEAnalysis::default();
        let ode_ob_type = ode_analysis.variable_ob_type;
        let ode_pos_cont_type = ode_analysis.positive_contribution_mor_type;
        let ode_neg_cont_type = ode_analysis.negative_contribution_mor_type;

        let mut associated_parameters: HashMap<QualifiedName, LinearODEParameter> = HashMap::new();

        // Each variable in the CLD gives a variable in the ODE system.
        for var in model.ob_generators_with_type(&self.var_ob_type) {
            // Add the variable to the ODE system.
            ode_model.add_ob(var.clone(), ode_ob_type.clone());
        }

        // Links in the CLD give contributions to the ODEs governing their *codomain*, namely
        // x -> y gives (d/dt)y += x. Each positive link in the CLD gives a positive contribution
        // and each negative link a negative contribution.
        for link in model.mor_generators_with_type(&self.pos_link_type) {
            let dom = model.get_dom(&link).unwrap();
            let cod = model.get_cod(&link).unwrap();
            let dom_object = ModalOb::Generator(dom.clone());
            let cod_object = ModalOb::Generator(cod.clone());

            let term = ModalOb::List(List::Symmetric, vec![dom_object.clone()]);
            let interaction_parameter = LinearODEParameter::Parameter { morphism: link.clone() };
            let interaction_name = link;

            associated_parameters.insert(interaction_name.clone(), interaction_parameter);
            ode_model.add_mor(interaction_name, term, cod_object, ode_pos_cont_type.clone());
        }
        for link in model.mor_generators_with_type(&self.neg_link_type) {
            let dom = model.get_dom(&link).unwrap();
            let cod = model.get_cod(&link).unwrap();
            let dom_object = ModalOb::Generator(dom.clone());
            let cod_object = ModalOb::Generator(cod.clone());

            let term = ModalOb::List(List::Symmetric, vec![dom_object.clone()]);
            let interaction_parameter = LinearODEParameter::Parameter { morphism: link.clone() };
            let interaction_name = link;

            associated_parameters.insert(interaction_name.clone(), interaction_parameter);
            ode_model.add_mor(interaction_name, term, cod_object, ode_neg_cont_type.clone());
        }

        PolynomialODEAnalysis::default()
            .build_system_custom_parameters(&ode_model, associated_parameters)
    }
}

/// Data defining a linear ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct LinearODEProblemData {
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "coefficients"))]
    coefficients: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    duration: f32,
}

/// Substitutes numerical rate coefficients into a symbolic linear system.
pub fn extend_linear_ode_scalars(
    sys: PolynomialSystem<QualifiedName, Parameter<LinearODEParameter>, i8>,
    data: &LinearODEProblemData,
) -> PolynomialSystem<QualifiedName, f32, i8> {
    let sys = sys.extend_scalars(|poly| {
        poly.eval(|param| match param {
            LinearODEParameter::Parameter { morphism } => {
                data.coefficients.get(morphism).cloned().unwrap_or_default()
            }
        })
    });

    sys.normalize()
}

/// Builds the numerical ODE analysis for a linear system whose scalars have been substituted.
pub fn into_linear_ode_analysis(
    sys: PolynomialSystem<QualifiedName, f32, i8>,
    data: LinearODEProblemData,
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
mod test {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::{
        simulate::ode::LatexEquation,
        stdlib::{models::*, theories::*},
    };

    // Symbolic tests.

    #[test]
    fn predator_prey_symbolic() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);
        let sys = CLDLinearODEAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = -Parameter(negative) y
            dy = Parameter(positive) x
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn complicated_symbolic() {
        let th = Rc::new(th_signed_category());
        let mut model = DiscreteDblModel::new(th);
        model.add_ob(name("a"), name("Object"));
        model.add_ob(name("b"), name("Object"));
        model.add_ob(name("c"), name("Object"));
        model.add_ob(name("d"), name("Object"));
        model.add_mor(name("f"), name("a"), name("b"), Path::Id(name("Object")));
        model.add_mor(name("g"), name("b"), name("a"), Path::Id(name("Object")));
        model.add_mor(name("h"), name("b"), name("a"), name("Negative").into());
        model.add_mor(name("i"), name("a"), name("c"), name("Negative").into());
        model.add_mor(name("j"), name("c"), name("d"), Path::Id(name("Object")));
        model.add_mor(name("k"), name("d"), name("b"), name("Negative").into());
        let sys = CLDLinearODEAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            da = (Parameter(g) - Parameter(h)) b
            db = Parameter(f) a - Parameter(k) d
            dc = -Parameter(i) a
            dd = Parameter(j) c
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // Test for LaTeX.

    #[test]
    fn to_latex() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);
        let sys = CLDLinearODEAnalysis::default().build_system(&model);
        let expected = vec![
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} x".to_string(),
                rhs: "-Parameter(negative) \\cdot y".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string(),
                rhs: "Parameter(positive) \\cdot x".to_string(),
            },
        ];
        assert_eq!(expected, sys.to_latex_equations());
    }

    // Numerical test.

    #[test]
    fn predator_prey_numerical() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);

        let data = LinearODEProblemData {
            coefficients: [(name("positive"), 3.0), (name("negative"), 2.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let sys = CLDLinearODEAnalysis::default().build_system(&model);
        let analysis = extend_linear_ode_scalars(sys, &data);
        let expected = expect!([r#"
            dx = -2 y
            dy = 3 x
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
