//! Lotka-Volterra ODE analysis of models.
//!
//! This follows the structure of [`ode::ode_semantics`], implementing `ODESemantics` for
//! the struct `LotkaVolterraSemantics`.
//!
//! [`ode::ode_semantics`]: crate::stdlib::analyses::ode::ode_semantics

use std::collections::HashMap;
use std::fmt;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::Parameter;
use crate::one::Path;
use crate::simulate::ode::PolynomialSystem;
use crate::stdlib::analyses::ode::ode_semantics::*;
use crate::zero::name;
use crate::{
    dbl::model::{DiscreteDblModel, MutDblModel},
    one::QualifiedPath,
    zero::QualifiedName,
};

/// Implementing Lotka-Volterra as an ODE semantics for models of type `DiscreteDblModel`.
pub struct LotkaVolterraSemantics;

impl ODESemantics for LotkaVolterraSemantics {
    type ModelType = DiscreteDblModel;
    type ParameterType = LotkaVolterraParameter;
    type AnalysisType = LotkaVolterraAnalysis;
    type ProblemDataType = LotkaVolterraProblemData;
}

/// Parameters in the Lotka-Volterra equations come in two flavours, corresponding to
/// either variables or links.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum LotkaVolterraParameter {
    /// The parameter associated to a variable.
    Growth {
        /// The variable.
        variable: QualifiedName,
    },
    /// The parameter associated to a link.
    Interaction {
        /// The link.
        link: QualifiedName,
    },
}

impl fmt::Display for LotkaVolterraParameter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self {
            Self::Growth { variable } => {
                write!(f, "Growth({})", variable)
            }
            Self::Interaction { link } => {
                write!(f, "Interaction({})", link)
            }
        }
    }
}

impl ODEParameterType for LotkaVolterraParameter {}

/// This Lotka-Volterra ODE analysis is intended for application to CLDs.
pub struct LotkaVolterraAnalysis {
    /// Object type for variables.
    pub var_ob_type: QualifiedName,
    /// Morphism type for positive links.
    pub pos_link_type: QualifiedPath,
    /// Morphism type for negative links.
    pub neg_link_type: QualifiedPath,
}

impl Default for LotkaVolterraAnalysis {
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
        <LotkaVolterraSemantics as ODESemantics>::ModelType,
        <LotkaVolterraSemantics as ODESemantics>::ParameterType,
    > for LotkaVolterraAnalysis
{
    /// Creates a Lotka-Volterra system with symbolic rate coefficients.
    ///
    /// A system of ODEs that is affine in its *logarithmic* derivative. These are
    /// sometimes called the "generalized Lotka-Volterra equations." For more, see
    /// [Wikipedia](https://en.wikipedia.org/wiki/Generalized_Lotka%E2%80%93Volterra_equation)
    /// and [our paper on regulatory networks](crate::refs::RegNets).
    fn build_semantics(
        &self,
    ) -> ODESemanticsBuilder<
        <LotkaVolterraSemantics as ODESemantics>::ModelType,
        <LotkaVolterraSemantics as ODESemantics>::ParameterType,
    > {
        // Each variable in the CLD gives a variable in the ODE system.
        let variable_builders = vec![ODEVariableBuilder::Object {
            ob_type: LotkaVolterraAnalysis::default().var_ob_type,
        }];

        // Each variable in the CLD *also* gives its growth contribution:
        // "(d/dt)x += g_x x" for a coefficient g_x.
        let growth = ODEContributionBuilder::<
            <LotkaVolterraSemantics as ODESemantics>::ModelType,
            <LotkaVolterraSemantics as ODESemantics>::ParameterType,
        >::Object {
            ob_types_and_signs: vec![(
                LotkaVolterraAnalysis::default().var_ob_type,
                ContributionSign::Positive,
            )],
            ob_contributions: vec![{
                |var, _| {
                    vec![Contribution {
                        name: var.clone(),
                        monomial: vec![var.clone()],
                        parameter: LotkaVolterraParameter::Growth { variable: var.clone() },
                        target: var.clone(),
                    }]
                }
            }],
        };

        // Links in the CLD give contributions to the ODEs governing their codomain, namely
        // x -> y gives "(d/dt)y += k_xy xy" for a coefficient k_xy. Each positive link
        // in the CLD gives a positive contribution, and each negative link a negative contribution.
        let interaction = ODEContributionBuilder::<
            <LotkaVolterraSemantics as ODESemantics>::ModelType,
            <LotkaVolterraSemantics as ODESemantics>::ParameterType,
        >::Morphism {
            mor_types_and_signs: vec![
                (LotkaVolterraAnalysis::default().pos_link_type, ContributionSign::Positive),
                (LotkaVolterraAnalysis::default().neg_link_type, ContributionSign::Negative),
            ],
            mor_contributions: vec![{
                |link, model| {
                    let dom = model.get_dom(link).unwrap();
                    let cod = model.get_cod(link).unwrap();
                    vec![Contribution {
                        name: link.clone(),
                        monomial: vec![dom.clone(), cod.clone()],
                        parameter: LotkaVolterraParameter::Interaction { link: link.clone() },
                        target: cod.clone(),
                    }]
                }
            }],
        };

        ODESemanticsBuilder {
            variable_builders,
            contribution_builders: vec![growth, interaction],
        }
    }
}

/// Data defining a Lotka-Volterra ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct LotkaVolterraProblemData {
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "interactionCoefficients"))]
    interaction_coeffs: HashMap<QualifiedName, f32>,

    /// Map from object IDs to growth rates (arbitrary real numbers).
    #[cfg_attr(feature = "serde", serde(rename = "growthRates"))]
    growth_rates: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    duration: f32,
}

impl ODESemanticsProblemData<<LotkaVolterraSemantics as ODESemantics>::ParameterType>
    for LotkaVolterraProblemData
{
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
            Parameter<<LotkaVolterraSemantics as ODESemantics>::ParameterType>,
            i8,
        >,
    ) -> PolynomialSystem<QualifiedName, f32, i8> {
        let sys = sys.extend_scalars(|poly| {
            poly.eval(|param| match param {
                LotkaVolterraParameter::Growth { variable } => {
                    self.growth_rates.get(variable).cloned().unwrap_or_default()
                }
                LotkaVolterraParameter::Interaction { link } => {
                    self.interaction_coeffs.get(link).cloned().unwrap_or_default()
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
        let sys = LotkaVolterraAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = Growth(x) x - Interaction(negative) x y
            dy = Interaction(positive) x y + Growth(y) y
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
        let sys = LotkaVolterraAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            da = Growth(a) a + (Interaction(g) - Interaction(h)) a b
            db = Interaction(f) a b + Growth(b) b - Interaction(k) b d
            dc = -Interaction(i) a c + Growth(c) c
            dd = Interaction(j) c d + Growth(d) d
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // Test for LaTeX.

    #[test]
    fn to_latex() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);
        let sys = LotkaVolterraAnalysis::default().build_system(&model);
        let expected = vec![
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} x".to_string(),
                rhs: "Growth(x) \\cdot x - Interaction(negative) \\cdot x \\cdot y".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string(),
                rhs: "Interaction(positive) \\cdot x \\cdot y + Growth(y) \\cdot y".to_string(),
            },
        ];
        assert_eq!(expected, sys.to_latex_equations());
    }

    // Numerical test.

    #[test]
    fn predator_prey_numerical() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);

        let data = LotkaVolterraProblemData {
            interaction_coeffs: [(name("positive"), 1.0), (name("negative"), 1.0)]
                .into_iter()
                .collect(),
            growth_rates: [(name("x"), 2.0), (name("y"), -1.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let sys = LotkaVolterraAnalysis::default().build_system(&model);
        let analysis = data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = 2 x - x y
            dy = x y - y
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
