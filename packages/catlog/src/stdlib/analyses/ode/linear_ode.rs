//! Linear constant-coefficient (LCC) first-order ODE analysis of models.
//!
//! This follows the structure of [`ode::ode_semantics`], implementing `ODESemantics` for
//! the struct `LCCSemantics`. For heritage reasons, "LCC" is sometimes referred to as "LinearODE".
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
use crate::one::Path;
use crate::simulate::ode::PolynomialSystem;
use crate::stdlib::analyses::ode::ode_semantics::{
    ContributionSign, ODEParameterType, ODESemantics, ODESemanticsAnalysis,
    ODESemanticsProblemData, PolynomialODESystemBuilder,
};
use crate::zero::name;
use crate::{dbl::model::DiscreteDblModel, one::QualifiedPath, zero::QualifiedName};

/// Implementing LCC as an ODE semantics for models of type `DiscreteDblModel`.
pub struct LCCSemantics;

impl ODESemantics for LCCSemantics {
    type ModelType = DiscreteDblModel;
    type ParameterType = LCCParameter;
    type AnalysisType = LCCAnalysis;
    type ProblemDataType = LCCProblemData;
}

/// Parameters in the linear equations correspond only to morphisms.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum LCCParameter {
    /// The parameter associated to a morphism.
    Parameter {
        /// The morphism.
        morphism: QualifiedName,
    },
}

impl fmt::Display for LCCParameter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Parameter { morphism } => {
                write!(f, "Parameter({})", morphism)
            }
        }
    }
}

impl ODEParameterType for LCCParameter {}

/// Linear ODE analysis for causal loop diagrams (CLDs).
pub struct LCCAnalysis {
    /// Object type for variables.
    pub var_ob_type: QualifiedName,
    /// Morphism type for positive links.
    pub pos_link_type: QualifiedPath,
    /// Morphism type for negative links.
    pub neg_link_type: QualifiedPath,
}

impl Default for LCCAnalysis {
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
        <LCCSemantics as ODESemantics>::ModelType,
        <LCCSemantics as ODESemantics>::ParameterType,
    > for LCCAnalysis
{
    /// Creates a linear system with symbolic rate coefficients.
    ///
    /// A system of ODEs for building arbitrary LCC ODEs from CLDs.
    fn build_system_builder(
        &self,
        model: &<LCCSemantics as ODESemantics>::ModelType,
    ) -> PolynomialODESystemBuilder<<LCCSemantics as ODESemantics>::ParameterType> {
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
                LCCParameter::Parameter { morphism: mor },
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
                LCCParameter::Parameter { morphism: mor },
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
pub struct LCCProblemData {
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "coefficients"))]
    coefficients: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    duration: f32,
}

impl ODESemanticsProblemData<<LCCSemantics as ODESemantics>::ParameterType> for LCCProblemData {
    fn initial_values(&self) -> HashMap<QualifiedName, f32> {
        self.initial_values.clone()
    }

    fn duration(&self) -> f32 {
        self.duration
    }

    fn extend_scalars(
        &self,
        sys: PolynomialSystem<
            QualifiedName,
            Parameter<<LCCSemantics as ODESemantics>::ParameterType>,
            i8,
        >,
    ) -> PolynomialSystem<QualifiedName, f32, i8> {
        let sys = sys.extend_scalars(|poly| {
            poly.eval(|param| match param {
                LCCParameter::Parameter { morphism } => {
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
        simulate::ode::LatexEquation,
        stdlib::{models::*, theories::*},
    };

    // Symbolic tests.

    #[test]
    fn predator_prey_symbolic() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);
        let sys = LCCAnalysis::default().build_system(&model);
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
        let sys = LCCAnalysis::default().build_system(&model);
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
        let sys = LCCAnalysis::default().build_system(&model);
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

        let data = LCCProblemData {
            coefficients: [(name("positive"), 3.0), (name("negative"), 2.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let sys = LCCAnalysis::default().build_system(&model);
        let analysis = data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = -2 y
            dy = 3 x
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
