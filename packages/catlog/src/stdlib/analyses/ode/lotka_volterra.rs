//! Lotka-Volterra ODE analysis of models.
//!
//! The main entry point for this module is
//! [`lotka_volterra_analysis`](SignedCoefficientBuilder::lotka_volterra_analysis).

use std::collections::HashMap;
use std::rc::Rc;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::Parameter;
use crate::dbl::modal::List;
use crate::dbl::model::{FpDblModel, ModalDblModel, ModalOb, MutDblModel};
use crate::one::Path;
use crate::simulate::ode::PolynomialSystem;
use crate::stdlib::analyses::ode::PolynomialODEAnalysis;
use crate::stdlib::th_signed_polynomial_ode_system;
use crate::zero::{name, name_seg};
use crate::{
    dbl::model::DiscreteDblModel,
    one::QualifiedPath,
    zero::{QualifiedName},
};

/// TODO: documentation
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
    ) -> PolynomialSystem<QualifiedName, Parameter<QualifiedName>, i8> {
        let ode_theory = Rc::new(th_signed_polynomial_ode_system());
        let mut ode_model = ModalDblModel::new(ode_theory);

        let ode_analysis = PolynomialODEAnalysis::default();
        let ode_ob_type = ode_analysis.variable_ob_type;
        let ode_pos_cont_type = ode_analysis.positive_contribution_mor_type;
        let ode_neg_cont_type = ode_analysis.negative_contribution_mor_type;

        // Each variable in the CLD gives a variable in the ODE system *as well as*
        // its growth contribution: (d/dt)x += x.
        for var in model.ob_generators_with_type(&self.var_ob_type) {
            // Add the variable to the ODE system.
            ode_model.add_ob(var.clone(), ode_ob_type.clone());

            // Add the growth contribution to the ODE system.
            let var_object = ModalOb::Generator(var.clone());
            let var_name = var.clone().snoc(name_seg("Growth"));
            ode_model.add_mor(var_name, var_object.clone(), var_object, ode_pos_cont_type.clone());
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
            let interaction_name =
                dom.clone().snoc(name_seg("Increases")).snoc(cod.clone().only().unwrap());
            ode_model.add_mor(interaction_name, term, cod_object, ode_pos_cont_type.clone());
        }
        for link in model.mor_generators_with_type(&self.neg_link_type) {
            let dom = model.get_dom(&link).unwrap();
            let cod = model.get_cod(&link).unwrap();
            let dom_object = ModalOb::Generator(dom.clone());
            let cod_object = ModalOb::Generator(cod.clone());

            let term = ModalOb::List(List::Symmetric, vec![dom_object.clone(), cod_object.clone()]);
            let interaction_name =
                dom.clone().snoc(name_seg("Decreases")).snoc(cod.clone().only().unwrap());
            ode_model.add_mor(interaction_name, term, cod_object, ode_neg_cont_type.clone());
        }

        PolynomialODEAnalysis::default().build_system(&ode_model)
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

// /// Substitutes numerical rate coefficients into a symbolic mass-action system.
// pub fn extend_mass_action_scalars(
//     sys: PolynomialSystem<QualifiedName, Parameter<FlowParameter>, i8>,
//     data: &MassActionProblemData,
// ) -> PolynomialSystem<QualifiedName, f32, i8> {
//     let sys = sys.extend_scalars(|poly| {
//         poly.eval(|flow| match flow {
//             FlowParameter::Balanced { transition } => {
//                 data.transition_rates.get(transition).cloned().unwrap_or_default()
//             }
//             FlowParameter::Unbalanced { direction, parameter } => match (direction, parameter) {
//                 (Direction::IncomingFlow, RateParameter::PerTransition { transition }) => {
//                     data.transition_production_rates.get(transition).cloned().unwrap_or_default()
//                 }
//                 (Direction::OutgoingFlow, RateParameter::PerTransition { transition }) => {
//                     data.transition_consumption_rates.get(transition).cloned().unwrap_or_default()
//                 }
//                 (Direction::IncomingFlow, RateParameter::PerPlace { transition, place }) => data
//                     .place_production_rates
//                     .get(transition)
//                     .and_then(|rate| rate.get(place))
//                     .copied()
//                     .unwrap_or_default(),
//                 (Direction::OutgoingFlow, RateParameter::PerPlace { transition, place }) => data
//                     .place_consumption_rates
//                     .get(transition)
//                     .and_then(|rate| rate.get(place))
//                     .copied()
//                     .unwrap_or_default(),
//             },
//         })
//     });

//     sys.normalize()
// }

// /// Builds the numerical ODE analysis for a mass-action system whose scalars have been substituted.
// pub fn into_mass_action_analysis(
//     sys: PolynomialSystem<QualifiedName, f32, i8>,
//     data: MassActionProblemData,
// ) -> ODEAnalysis<NumericalPolynomialSystem<i8>> {
//     let ob_index: IndexMap<_, _> =
//         sys.components.keys().cloned().enumerate().map(|(i, x)| (x, i)).collect();
//     let n = ob_index.len();

//     let initial_values = ob_index
//         .keys()
//         .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
//     let x0 = DVector::from_iterator(n, initial_values);

//     let num_sys = sys.to_numerical();
//     let problem = ODEProblem::new(num_sys, x0).end_time(data.duration);

//     ODEAnalysis::new(problem, ob_index)
// }

// pub fn lotka_volterra_system<Var, Coef>(
//     vars: &[Var],
//     interaction_coeffs: DMatrix<Coef>,
//     growth_rates: DVector<Coef>,
// ) -> PolynomialSystem<Var, Coef, u8>
// where
//     Var: Clone + Hash + Ord,
//     Coef: Clone + Add<Output = Coef> + One + Scalar + Zero,
// {
//     let system = PolynomialSystem {
//         components: interaction_coeffs
//             .row_iter()
//             .zip(vars)
//             .zip(&growth_rates)
//             .map(|((row, i), r)| {
//                 (
//                     i.clone(),
//                     Polynomial::<_, Coef, _>::generator(i.clone())
//                         * (row
//                             .iter()
//                             .zip(vars)
//                             .map(|(a, j)| (a.clone(), Monomial::generator(j.clone())))
//                             .collect::<Polynomial<_, _, _>>()
//                             + r.clone()),
//                 )
//             })
//             .collect(),
//     };
//     system.normalize()
// }

// impl SignedCoefficientBuilder<QualifiedName, QualifiedPath> {
//     /// Lotka-Volterra ODE analysis for a model of a double theory.
//     ///
//     /// The main application we have in mind is the Lotka-Volterra ODE semantics for
//     /// signed graphs described in our [paper on regulatory
//     /// networks](crate::refs::RegNets).
//     pub fn lotka_volterra_analysis(
//         &self,
//         model: &DiscreteDblModel,
//         data: LotkaVolterraProblemData,
//     ) -> ODEAnalysis<NumericalPolynomialSystem<u8>> {
//         let (system, ob_index) = self.lotka_volterra_system(model);
//         let n = ob_index.len();

//         let initial_values = ob_index
//             .keys()
//             .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
//         let x0 = DVector::from_iterator(n, initial_values);

//         let system = system
//             .extend_scalars(|poly| {
//                 poly.eval(|id| {
//                     data.interaction_coeffs
//                         .get(id)
//                         .or(data.growth_rates.get(id))
//                         .copied()
//                         .unwrap_or_default()
//                 })
//             })
//             .to_numerical();
//         let problem = ODEProblem::new(system, x0).end_time(data.duration);
//         ODEAnalysis::new(problem, ob_index)
//     }

//     /// Lotka-Volterra ODE system for an model of a double theory.
//     pub fn lotka_volterra_system(
//         &self,
//         model: &DiscreteDblModel,
//     ) -> (
//         PolynomialSystem<QualifiedName, Parameter<QualifiedName>, u8>,
//         IndexMap<QualifiedName, usize>,
//     ) {
//         let (matrix, ob_index) = self.build_matrix(model);
//         let n = ob_index.len();

//         let growth_rate_params = ob_index
//             .keys()
//             .map(|ob| [(1.0, Monomial::generator(ob.clone()))].into_iter().collect());
//         let b = DVector::from_iterator(n, growth_rate_params);

//         let system = lotka_volterra_system(&ob_index.keys().cloned().collect_vec(), matrix, b);
//         (system, ob_index)
//     }
// }

// #[cfg(test)]
// mod test {
//     use expect_test::expect;
//     use std::rc::Rc;

//     use super::*;
//     use crate::stdlib;
//     use crate::{one::Path, zero::name};

//     fn builder() -> SignedCoefficientBuilder<QualifiedName, QualifiedPath> {
//         SignedCoefficientBuilder::new(name("Object"))
//             .add_positive(Path::Id(name("Object")))
//             .add_negative(Path::single(name("Negative")))
//     }

//     #[test]
//     fn predator_prey_symbolic() {
//         let th = Rc::new(stdlib::theories::th_signed_category());
//         let neg_feedback = stdlib::models::negative_feedback(th);
//         let (sys, _) = builder().lotka_volterra_system(&neg_feedback);
//         let sys = sys.extend_scalars(|coef| coef.map_variables(|name| format!("Param({name})")));
//         let expected = expect!([r#"
//             dx = Param(x) x - Param(negative) x y
//             dy = Param(positive) x y + Param(y) y
//         "#]);
//         expected.assert_eq(&sys.to_string());
//     }

//     #[test]
//     fn predator_prey_numerical() {
//         let th = Rc::new(stdlib::theories::th_signed_category());
//         let neg_feedback = stdlib::models::negative_feedback(th);

//         let data = LotkaVolterraProblemData {
//             interaction_coeffs: [(name("positive"), 1.0), (name("negative"), 1.0)]
//                 .into_iter()
//                 .collect(),
//             growth_rates: [(name("x"), 2.0), (name("y"), -1.0)].into_iter().collect(),
//             initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
//             duration: 10.0,
//         };

//         let sys = builder().lotka_volterra_analysis(&neg_feedback, data).problem.system;
//         let expected = expect!([r#"
//             dx0 = 2 x0 - x0 x1
//             dx1 = x0 x1 - x1
//         "#]);
//         expected.assert_eq(&sys.to_string());
//     }
// }
