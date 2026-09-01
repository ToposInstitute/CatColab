//! Analyses for different ODE semantics on models.
//!
//! Inspired by schema migration, we define the data of an ODE semantics on models in a theory to
//! consist of (in particular) a `PolynomialODESystemBuilder`, which constructs a model of the
//! theory of multicategories (viewed as polynomial ODE systems with abstract coefficients). This
//! is then passed to [`ode::v1::polynomial_ode::PolynomialODEAnalysis`] which constructs from this
//! a `PolynomialSystem`, using `build_system_custom_parameters()`.

//! In short, this module constructs multicategories from models, and [`ode::v1::polynomial_ode`]
//! then constructs `PolynomialSystem` from multicategories.
//!
//! To implement a new ODE semantics for models in some theory, one essentially needs to create an
//! empty struct and implement `ODESemantics`, and then follow the compiler. For more documentation,
//! see [`ode::v1::polynomial_ode`]; for a simple example see [`ode::v1::lotka_volterra`], and for a
//! more complicated example see [`ode::v1::mass_action`].
//!
//! [`ode::v1::polynomial_ode`]: crate::stdlib::analyses::ode::v1::polynomial_ode
//! [`ode::v1::polynomial_ode::PolynomialODEAnalysis`]: crate::stdlib::analyses::ode::v1::polynomial_ode::PolynomialODEAnalysis
//! [`ode::v1::lotka_volterra`]: crate::stdlib::analyses::ode::v1::lotka_volterra
//! [`ode::v1::mass_action`]: crate::stdlib::analyses::ode::v1::mass_action

use indexmap::IndexMap;
use nalgebra::DVector;
use std::collections::HashMap;
use std::fmt;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::{
    dbl::{
        modal::{List, ModeApp},
        model::{
            DblModel, DiscreteDblModel, DiscreteTabModel, ModalDblModel, ModalOb, MutDblModel,
        },
        theory::{NonUnital, Unital},
    },
    latex::{Latex, ToLatexWithMap},
    one::FgCategory,
    simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem},
    stdlib::{
        analyses::ode::{ODEAnalysis, Parameter, PolynomialODEAnalysis},
        th_signed_polynomial_ode_system,
    },
    zero::{QualifiedName, name},
};

/// The trait for an ODE semantics on models.
pub trait ODESemantics {
    /// The type of the model for which these ODE semantics are intended.
    type ModelType: DblModelForODESemantics;
    /// The type of the parameters associated to each contribution in the multicategory built from
    /// the model. The "default" value for this would be `QualifiedName`, but it can be useful to
    /// have a more descriptive type. For example, we might wish for certain parameters to be
    /// identified with one another, or to be rendered differently in debug/LaTeX output. For an
    /// instructive example, see `mass_action::MassActionParameter` or
    /// `lotka_volterra::LotkaVolterraParameter`.
    type ParameterType: ODEParameterType;
    /// The data describing the things that the ODE semantics "cares about". See the documentation
    /// for `ODESemanticsAnalysis` for more details.
    type AnalysisType: ODESemanticsAnalysis<Self::ModelType, Self::ParameterType>;
    /// The data necessary for simulating the system of equations, to be provided at run-time by the
    /// front-end. For example, which values appear in the front-end analysis widget, and to which
    /// which parameters within the algebraic equations they correspond.
    type ParameterData: ODESemanticsScalarExtension<Self::ParameterType>;
}

// ┌--------------┐
// | 0. ModelType |
// └--------------┘

/// The models for which we support ODE semantics need to be sufficiently nice, though these bounds
/// should not prove particularly restrictive in practice.
pub trait DblModelForODESemantics:
    FgCategory + DblModel + MutDblModel<ObGen = QualifiedName, MorGen = QualifiedName> + Clone
{
}

impl DblModelForODESemantics for DiscreteDblModel {}
impl DblModelForODESemantics for DiscreteTabModel {}
impl DblModelForODESemantics for ModalDblModel<Unital> {}
impl DblModelForODESemantics for ModalDblModel<NonUnital> {}

// ┌------------------┐
// | 1. ParameterType |
// └------------------┘

// Our way of viewing multicategories as polynomial ODE systems leads to a specific choice of
// interpretation of *parameters*, or coefficients. As explained in `ode::v1::polynomial_ode`, we
// build up our system of equations by giving *contributions*, i.e. monomials to add to the equation
// describing the first-order time derivative of a specific variable. But in order to be able to
// express arbitrary polynomial ODEs, we need the ability to multiply these monomials by scalar
// coefficients. However, rather than reducing directly to *numerical* equations, it is useful to
// be able to express "algebraic" equations. That is, rather than specifying e.g. the contributions
//
//     d/dt(A) += 5 A^2 B
//     d/dt(B) += 2 A B
//
// we would like to be able to specify the contributions
//
//     d/dt(A) += c A^2 B
//     d/dt(B) += d A B
//
// where c and d are scalars left unspecified up until the moment that we want to numerically
// simulate the system.
//
// But we also care about how to render these parameters. For example, consider Lotka-Volterra
// semantics, where we have two types of contributions:
//
//     d/dt(B) += g B    <- "growth"
//     d/dt(B) += k A B  <- "interaction"
//
// for parameters g and k. For clarity, it's helpful to make clear that the growth parameter "comes
// from" an object B, whereas the interaction parameter "comes from" an arrow A -> B, writing
// something like
//
//     d/dt(B) += (g_B) B
//     d/db(B) += (k_A^B) A B.
//
// To support this, we allow parameters to make explicit their dependencies, which enables the use
// of `ToLatexWithMap` for more intricate rendering of parameters (as above), but also gives the
// bonus of allowing us to specify that certain parameters should be made equal to one another.
// For the latter, consider the case of taking all of the k_A^B above and instead simply writing
// them as k_A. More precisely, we can appeal to this extra structure of explicit dependencies in
// `ODESemanticsScalarExtension::extend_scalars` (see documentation there below).

/// The type of the parameters in the ODE system need to be sufficiently nice, though
/// (again) these bounds are not particularly restrictive. The two that will need the most
/// manual effort for implementation are `Display` and `ToLatex`, which govern how these
/// coefficients should be rendered. The `Display` trait is used for debugging whereas the
/// `ToLatex` trait is used for user-facing display.
pub trait ODEParameterType: Eq + Ord + Clone + fmt::Display + ToLatexWithMap {}

/// The simplest type for parameters is `QualifiedName`.
impl ToLatexWithMap for QualifiedName {
    fn to_latex_with_map<T: Fn(&QualifiedName) -> String>(&self, f: T) -> Latex {
        Latex(f(self))
    }
}

impl ODEParameterType for QualifiedName {}

// ┌---------------------------------------┐
// | INTERLUDE. PolynomialODESystemBuilder |
// └---------------------------------------┘

/// Builder for polynomial ODE systems.
///
/// This struct is just a convenient interface to construct a model of the theory of polynomial ODE
/// systems. Being an ordinary mutable Rust struct, it does *not* constitute a declarative language
/// to define ODE semantics for models of other theories. However, the idea is that it should be
/// used in a style that can mechanically translated to a future declarative language for model
/// migration.
#[derive(Clone)]
pub struct PolynomialODESystemBuilder<P: ODEParameterType> {
    model: ModalDblModel<NonUnital>,
    associated_parameters: HashMap<QualifiedName, P>,
}

impl<P: ODEParameterType> Default for PolynomialODESystemBuilder<P> {
    fn default() -> Self {
        let th = th_signed_polynomial_ode_system();
        Self {
            model: ModalDblModel::new(th.into()),
            associated_parameters: HashMap::new(),
        }
    }
}

/// A contribution to the ODE system consists of all the data that `ModalDblModel::add_mor()`
/// requires to create a multimorphism.
#[derive(Clone)]
pub struct Contribution<P: ODEParameterType> {
    /// The name of the multimorphism.
    pub id: QualifiedName,
    /// The target of the multimorphism, to be interpreted as the variable whose
    /// first derivative is affected by the monomial.
    pub target: QualifiedName,
    /// The sign of a contribution.
    pub sign: ContributionSign,
    /// The parameter (coefficient) to be associated with this contribution.
    pub parameter: P,
    /// The source of the multimorphism (a list of objects), to be interpreted
    /// as the monomial given by the product of all the list elements.
    pub monomial: Vec<QualifiedName>,
}

/// The sign of a contribution, since we work in *signed* multicategories.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Copy)]
pub enum ContributionSign {
    /// Positive contribution: (d/dt)y += x.
    Positive,
    /// Negative contribution: (d/dt)y -= x.
    Negative,
}

impl<P: ODEParameterType> PolynomialODESystemBuilder<P> {
    /// Constructs an empty ODE system.
    pub fn new() -> Self {
        Self::default()
    }

    /// Constructs an ODE system for an existing model of an ODE system. (Essentially trivial, but
    /// useful to reduce boilerplate).
    pub fn identity(model: ModalDblModel<NonUnital>) -> Self {
        Self {
            model,
            associated_parameters: HashMap::new(),
        }
    }

    /// Returns a model of the theory of polynomial ODE systems.
    pub fn model(self) -> ModalDblModel<NonUnital> {
        self.model
    }

    /// Returns the HashMap of associated parameters, giving the term of type `P: ODEParameterType`
    /// corresponding to each monomial.
    pub fn associated_parameters(self) -> HashMap<QualifiedName, P> {
        self.associated_parameters
    }

    /// Adds a state variable to the ODE system.
    pub fn add_variable(&mut self, var: QualifiedName) {
        self.model.add_ob(var, ModeApp::new(name("State")));
    }

    /// Adds a contribution to the ODE system.
    pub fn add_contribution(
        &mut self,
        id: QualifiedName,
        target: QualifiedName,
        sign: ContributionSign,
        parameter: P,
        monomial: impl IntoIterator<Item = QualifiedName>,
    ) {
        let monomial = monomial.into_iter().map(ModalOb::Generator).collect();
        let sign = match sign {
            ContributionSign::Positive => ModeApp::new(name("Contribution")).into(),
            ContributionSign::Negative => ModeApp::new(name("NegativeContribution")).into(),
        };

        self.model.add_mor(
            id.clone(),
            ModalOb::List(List::Symmetric, monomial),
            ModalOb::Generator(target),
            sign,
        );

        self.associated_parameters.insert(id, parameter);
    }
}

// ┌-----------------┐
// | 2. AnalysisType |
// └-----------------┘

/// This trait is where we define the actual ODE semantics in the implementation of
/// `build_system_builder`; `build_system` will almost certainly always use the default
/// implementation given below.
///
/// Note that the type that implements this trait is also where you are expected to state everything
/// that your semantics "cares about". For example, the default minimum is to give the values of
/// `ObType` and `MorType` that you want to distinguish between and iterate over. However,
/// this is left to the user: the type checker will *not* enforce anything helpful here. We
/// recommend looking at any existing implementations to get a better understanding.
pub trait ODESemanticsAnalysis<T: DblModelForODESemantics, P: ODEParameterType>: Default {
    /// The implementation of this function is what contains the actual data of the ODE semantics,
    /// in the form of a `PolynomialODESystemBuilder`.
    fn build_system_builder(&self, model: &T) -> PolynomialODESystemBuilder<P>;

    /// We simply feed the `PolynomialODESystemBuilder` constructed by the above function into
    /// `PolynomialODEAnalysis::build_system_custom_parameters`.
    fn build_system(&self, model: &T) -> PolynomialSystem<QualifiedName, Parameter<P>, i8> {
        let builder = self.build_system_builder(model);
        PolynomialODEAnalysis::default().build_system_custom_parameters(
            &builder.clone().model(),
            builder.associated_parameters(),
        )
    }
}

// ┌------------------┐
// | 3. ParameterData |
// └------------------┘

// As the counterpart to `ParameterType` above, we make formal here the data needed in order to turn
// a system of equations with "algebraic" parameters (with explicit dependencies) into numerical
// parameters (i.e. coefficients). For a useful example, see the implementations of balanced versus
// unbalanced mass-action semantics in `ode::v1::mass_action`.

/// This trait is required to be implemented for the `ParameterData` type, and is used to convert
/// the formal parameters of type `ODEParameterType` to floats.
pub trait ODESemanticsScalarExtension<P: ODEParameterType> {
    /// Take formal parameters and convert them into floats using problem data.
    fn extend_scalars(
        &self,
        system: PolynomialSystem<QualifiedName, Parameter<P>, i8>,
    ) -> PolynomialSystem<QualifiedName, f32, i8>;
}

/// The struct describing how to turn the formal system of ODEs into a numerical problem, to be
/// solved by an ODE solver and presented to the front-end. At minimum, such data must contain
/// initial values for variables and the intended duration of simulation, as well as the method for
/// converting the parameters (which are of type `ODEParameterType`) into floats.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
#[derive(Clone)]
pub struct ODESemanticsGeneralProblemData {
    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub initial_values: HashMap<QualifiedName, f32>,
    /// Duration of simulation.
    pub duration: f32,
}

impl Default for ODESemanticsGeneralProblemData {
    fn default() -> Self {
        Self {
            initial_values: HashMap::new(),
            duration: 10.0,
        }
    }
}

impl ODESemanticsGeneralProblemData {
    /// Default values for ODE semantics general problem data.
    pub fn new() -> Self {
        Self::default()
    }

    /// Converting the polynomial system into a system ready for use in numerical solvers. The default
    /// implementation here should essentially always be the desired one.
    pub fn build_analysis(
        &self,
        sys: PolynomialSystem<QualifiedName, f32, i8>,
    ) -> ODEAnalysis<NumericalPolynomialSystem<i8>> {
        let ob_index: IndexMap<_, _> =
            sys.components.keys().cloned().enumerate().map(|(i, x)| (x, i)).collect();
        let n = ob_index.len();

        let initial_values = ob_index
            .keys()
            .map(|ob| self.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let num_sys = sys.to_numerical();
        let problem = ODEProblem::new(num_sys, x0).end_time(self.duration);

        ODEAnalysis::new(problem, ob_index)
    }
}

/// Data for a numerical ODE semantics problem, which contains data generic across semantics and
/// also data specific to the ODE semantics in question.
pub trait ODESemanticsProblemData<S: ODESemantics>: Clone {
    /// The type of parameter data, which must implement `ODESemanticsScalarExtension::extend_scalars`.
    type ParameterData: ODESemanticsScalarExtension<S::ParameterType>;
    /// General data associated to an ODE problem: initial values and duration.
    fn general_data(self) -> ODESemanticsGeneralProblemData;
    /// Parameter-specific data associated to an ODE problem, depending on the associated type of
    /// parameter data.
    fn parameter_data(self) -> Self::ParameterData;
}
