//! Linear constant-coefficient first-order ODE analysis of models.
//!
//! This follows the structure of [`ode::ode_semantics`], implementing `ODESemantics` for the struct
//! `LinearODESemantics`.
//!
//! [`ode::ode_semantics`]: crate::stdlib::analyses::ode::ode_semantics

use std::collections::HashMap;
use std::fmt;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::Parameter;
use crate::dbl::model::{FpDblModel, MutDblModel};
use crate::latex::{Latex, ToLatexWithMap};
use crate::one::Path;
use crate::simulate::ode::PolynomialSystem;
use crate::stdlib::analyses::ode::ode_semantics::{
    ContributionSign, ODEParameterType, ODESemantics, ODESemanticsAnalysis,
    ODESemanticsProblemData, PolynomialODESystemBuilder,
};
use crate::zero::name;
use crate::{dbl::model::DiscreteDblModel, one::QualifiedPath, zero::QualifiedName};

/// Implementing LinearODE as an ODE semantics for models of type `DiscreteDblModel`.
pub struct LinearODESemantics;

impl ODESemantics for LinearODESemantics {
    type ModelType = DiscreteDblModel;
    type ParameterType = LinearODEParameter;
    type AnalysisType = LinearODEAnalysis;
    type EquationsDataType = ();
    type ProblemDataType = LinearODEProblemData;
}

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

impl ToLatexWithMap for LinearODEParameter {
    fn to_latex_with_map<T: Fn(&QualifiedName) -> String>(&self, f: T) -> Latex {
        match self {
            Self::Parameter { morphism } => Latex(format!("\\lambda_{{{}}}", f(morphism))),
        }
    }
}

impl ODEParameterType for LinearODEParameter {}

/// Linear ODE analysis for causal loop diagrams (CLDs).
pub struct LinearODEAnalysis {
    /// Object type for variables.
    pub var_ob_type: QualifiedName,
    /// Morphism type for positive links.
    pub pos_link_type: QualifiedPath,
    /// Morphism type for negative links.
    pub neg_link_type: QualifiedPath,
}

impl Default for LinearODEAnalysis {
    fn default() -> Self {
        let ob_type = name("Object");
        Self {
            var_ob_type: ob_type.clone(),
            pos_link_type: Path::Id(ob_type.clone()),
            neg_link_type: Path::single(name("Negative")),
        }
    }
}

impl
    ODESemanticsAnalysis<
        <LinearODESemantics as ODESemantics>::ModelType,
        <LinearODESemantics as ODESemantics>::ParameterType,
    > for LinearODEAnalysis
{
    /// Creates a linear system with symbolic rate coefficients.
    ///
    /// A system of ODEs for building arbitrary LinearODE ODEs from CLDs.
    fn build_system_builder(
        &self,
        model: &DiscreteDblModel,
    ) -> PolynomialODESystemBuilder<LinearODEParameter> {
        let mut builder = PolynomialODESystemBuilder::new();

        for var in model.ob_generators_with_type(&self.var_ob_type) {
            // For each object, we create a variable.
            builder.add_variable(var.clone());
        }

        for mor in model.mor_generators_with_type(&self.pos_link_type) {
            let (Some(dom), Some(cod)) = (model.get_dom(&mor), model.get_cod(&mor)) else {
                continue;
            };

            // The morphism
            //   f: x -> y
            // becomes the contribution
            //   \dot{y} += Parameter_f x
            builder.add_contribution(
                mor.clone(),
                cod.clone(),
                ContributionSign::Positive,
                LinearODEParameter::Parameter { morphism: mor },
                [dom.clone()],
            );
        }

        for mor in model.mor_generators_with_type(&self.neg_link_type) {
            let (Some(dom), Some(cod)) = (model.get_dom(&mor), model.get_cod(&mor)) else {
                continue;
            };

            // The morphism
            //   f: x -> y
            // becomes the contribution
            //   \dot{y} -= Parameter_f x
            builder.add_contribution(
                mor.clone(),
                cod.clone(),
                ContributionSign::Negative,
                LinearODEParameter::Parameter { morphism: mor },
                [dom.clone()],
            );
        }

        builder
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

impl ODESemanticsProblemData<<LinearODESemantics as ODESemantics>::ParameterType>
    for LinearODEProblemData
{
    fn initial_values(&self) -> HashMap<QualifiedName, f32> {
        self.initial_values.clone()
    }

    fn duration(&self) -> f32 {
        self.duration
    }

    fn extend_scalars(
        &self,
        sys: PolynomialSystem<QualifiedName, Parameter<LinearODEParameter>, i8>,
    ) -> PolynomialSystem<QualifiedName, f32, i8> {
        let sys = sys.extend_scalars(|poly| {
            poly.eval(|param| match param {
                LinearODEParameter::Parameter { morphism } => {
                    self.coefficients.get(morphism).cloned().unwrap_or_default()
                }
            })
        });

        sys.normalize()
    }
}

#[cfg(test)]
mod test {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::{
        dbl::model::MutDblModel,
        latex::{LatexEquation, LatexEquations, wrap_with_backslash_text},
        stdlib::{models::*, theories::*},
    };

    // Symbolic tests.

    #[test]
    fn predator_prey_symbolic() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);
        let sys = LinearODEAnalysis::default().build_system(&model);
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
        let sys = LinearODEAnalysis::default().build_system(&model);
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
        let system = LinearODEAnalysis::default().build_system(&model);
        let equations =
            system.to_latex_equations_with_map(|name| wrap_with_backslash_text(name.to_string()));
        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} x".to_string()),
                rhs: Latex("-\\lambda_{\\text{negative}} \\cdot y".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string()),
                rhs: Latex("\\lambda_{\\text{positive}} \\cdot x".to_string()),
            },
        ]);
        assert_eq!(expected, equations);
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

        let sys = LinearODEAnalysis::default().build_system(&model);
        let analysis = data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = -2 y
            dy = 3 x
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
