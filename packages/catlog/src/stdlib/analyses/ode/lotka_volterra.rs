//! Lotka-Volterra ODE analysis of models.
//!
//! The main entry point for this module is
//! [`lotka_volterra_analysis`](SignedCoefficientBuilder::lotka_volterra_analysis).

use indexmap::IndexMap;
use std::collections::HashMap;
use std::fmt;
use std::rc::Rc;

use nalgebra::DVector;
#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::Parameter;
use crate::dbl::modal::List;
use crate::dbl::model::{FpDblModel, ModalDblModel, ModalOb, MutDblModel};
use crate::one::Path;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::stdlib::analyses::ode::{ODEAnalysis, PolynomialODEAnalysis};
use crate::stdlib::th_signed_polynomial_ode_system;
use crate::zero::name;
use crate::{dbl::model::DiscreteDblModel, one::QualifiedPath, zero::QualifiedName};

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

/// Lotka-Volterra ODE analysis for causal loop diagrams (CLDs).
pub struct CLDLotkaVolterraAnalysis {
    /// Object type for variables.
    pub var_ob_type: QualifiedName,
    /// Morphism type for positive links.
    pub pos_link_type: QualifiedPath,
    /// Morphism type for negative links.
    pub neg_link_type: QualifiedPath,
}

impl Default for CLDLotkaVolterraAnalysis {
    fn default() -> Self {
        let ob_type = name("Object");
        Self {
            var_ob_type: ob_type.clone(),
            pos_link_type: Path::Id(ob_type.clone()),
            neg_link_type: Path::single(name("Negative")),
        }
    }
}

impl CLDLotkaVolterraAnalysis {
    /// Creates a Lotka-Volterra system with symbolic rate coefficients.
    ///
    /// A system of ODEs that is affine in its *logarithmic* derivative. These are
    /// sometimes called the "generalized Lotka-Volterra equations." For more, see
    /// [Wikipedia](https://en.wikipedia.org/wiki/Generalized_Lotka%E2%80%93Volterra_equation)
    /// and [our paper on regulatory networks](crate::refs::RegNets).
    pub fn build_system(
        &self,
        model: &DiscreteDblModel,
    ) -> PolynomialSystem<QualifiedName, Parameter<LotkaVolterraParameter>, i8> {
        let ode_theory = Rc::new(th_signed_polynomial_ode_system());
        let mut ode_model = ModalDblModel::new(ode_theory);

        let ode_analysis = PolynomialODEAnalysis::default();
        let ode_ob_type = ode_analysis.variable_ob_type;
        let ode_pos_cont_type = ode_analysis.positive_contribution_mor_type;
        let ode_neg_cont_type = ode_analysis.negative_contribution_mor_type;

        let mut associated_parameters: HashMap<QualifiedName, LotkaVolterraParameter> =
            HashMap::new();

        // Each variable in the CLD gives a variable in the ODE system *as well as*
        // its growth contribution: (d/dt)x += x.
        for var in model.ob_generators_with_type(&self.var_ob_type) {
            // for var in model.ob_generators_with_type(&self.var_ob_type) {
            // Add the variable to the ODE system.
            ode_model.add_ob(var.clone(), ode_ob_type.clone());

            // Add the growth contribution to the ODE system.
            let var_object = ModalOb::Generator(var.clone());
            let var_term = ModalOb::List(List::Symmetric, vec![var_object.clone()]);
            let var_parameter = LotkaVolterraParameter::Growth { variable: var.clone() };
            let var_name = var;

            associated_parameters.insert(var_name.clone(), var_parameter);
            ode_model.add_mor(var_name, var_term.clone(), var_object, ode_pos_cont_type.clone());
        }

        // Links in the CLD give contributions to the ODEs governing their *codomain*, namely
        // x -> y gives (d/dt)y += xy. Each positive link in the CLD gives a positive contribution
        // and each negative link a negative contribution.
        for link in model.mor_generators_with_type(&self.pos_link_type) {
            let dom = model.get_dom(&link).unwrap();
            let cod = model.get_cod(&link).unwrap();
            let dom_object = ModalOb::Generator(dom.clone());
            let cod_object = ModalOb::Generator(cod.clone());

            let term = ModalOb::List(List::Symmetric, vec![dom_object.clone(), cod_object.clone()]);
            let interaction_parameter = LotkaVolterraParameter::Interaction { link: link.clone() };
            let interaction_name = link;

            associated_parameters.insert(interaction_name.clone(), interaction_parameter);
            ode_model.add_mor(interaction_name, term, cod_object, ode_pos_cont_type.clone());
        }
        for link in model.mor_generators_with_type(&self.neg_link_type) {
            let dom = model.get_dom(&link).unwrap();
            let cod = model.get_cod(&link).unwrap();
            let dom_object = ModalOb::Generator(dom.clone());
            let cod_object = ModalOb::Generator(cod.clone());

            let term = ModalOb::List(List::Symmetric, vec![dom_object.clone(), cod_object.clone()]);
            let interaction_parameter = LotkaVolterraParameter::Interaction { link: link.clone() };
            let interaction_name = link;

            associated_parameters.insert(interaction_name.clone(), interaction_parameter);
            ode_model.add_mor(interaction_name, term, cod_object, ode_neg_cont_type.clone());
        }

        PolynomialODEAnalysis::default()
            .build_system_custom_parameters(&ode_model, associated_parameters)
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

/// Substitutes numerical rate coefficients into a symbolic Lotka-Volterra system.
pub fn extend_lotka_volterra_scalars(
    sys: PolynomialSystem<QualifiedName, Parameter<LotkaVolterraParameter>, i8>,
    data: &LotkaVolterraProblemData,
) -> PolynomialSystem<QualifiedName, f32, i8> {
    let sys = sys.extend_scalars(|poly| {
        poly.eval(|param| match param {
            LotkaVolterraParameter::Growth { variable } => {
                data.growth_rates.get(variable).cloned().unwrap_or_default()
            }
            LotkaVolterraParameter::Interaction { link } => {
                data.interaction_coeffs.get(link).cloned().unwrap_or_default()
            }
        })
    });

    sys.normalize()
}

/// Builds the numerical ODE analysis for a Lotka-Volterra system whose scalars have been substituted.
pub fn into_lotka_volterra_analysis(
    sys: PolynomialSystem<QualifiedName, f32, i8>,
    data: LotkaVolterraProblemData,
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
        let sys = CLDLotkaVolterraAnalysis::default().build_system(&model);
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
        let sys = CLDLotkaVolterraAnalysis::default().build_system(&model);
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
        let sys = CLDLotkaVolterraAnalysis::default().build_system(&model);
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

        let sys = CLDLotkaVolterraAnalysis::default().build_system(&model);
        let analysis = extend_lotka_volterra_scalars(sys, &data);
        let expected = expect!([r#"
            dx = 2 x - x y
            dy = x y - y
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
