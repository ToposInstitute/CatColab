//! Analyses for different ODE semantics on models.
//!
//! Inspired by schema migration, we define the data of an ODE semantics on models in a theory to
//! consist of (in particular) a `PolynomialODESystemBuilder`, which contains all the data needed
//! for [`ode::polynomial_ode::PolynomialODEAnalysis`] to do the following:
//!
//! 1. Build the system as a model of the theory of polynomial ODE systems (i.e. multicategories)
//!    with abstract coefficients, using `build_system_custom_parameters()`.
//! 2. Substitute in numerical coefficients, using `extend_polynomial_ode_scalars()`.
//! 3. Build an `ODEAnalysis<NumericalPolynomialSystem<i8>>` that can be fed into an ODE solver,
//!    using `polynomial_ode_analysis()`.
//!
//! In short, this module constructs multicategories from models, and [`ode::polynomial_ode`] then
//! constructs `PolynomialSystem` from multicategories.
//!
//! To implement a new ODE semantics for models in some theory, one essentially needs to create an
//! empty struct and implement `ODESemantics`, and then follow the compiler. For more documentation,
//! see [`ode::polynomial_ode`]; for an example implementation, see [`ode::mass_action`].
//!
//! [`ode::polynomial_ode`]: crate::stdlib::analyses::ode::polynomial_ode
//! [`ode::polynomial_ode::PolynomialODEAnalysis`]: crate::stdlib::analyses::ode::polynomial_ode::PolynomialODEAnalysis
//! [`ode::mass_action`]: crate::stdlib::analyses::ode::mass_action

use indexmap::IndexMap;
use nalgebra::DVector;
use std::{collections::HashMap, fmt};

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
    /// instructive example, see `MassActionParameter` in `ode::mass_action`.
    type ParameterType: ODEParameterType;
    /// The data describing the things that the ODE semantics "cares about". (See the documentation
    /// for `ODESemanticsAnalysis`).
    type AnalysisType: ODESemanticsAnalysis<Self::ModelType, Self::ParameterType>;
    /// The data describing how to turn the algebraic system of equations into a simulation,
    /// including e.g. which values that appear in the front-end analysis correspond to which
    /// parameters within the equations.
    type ProblemDataType: ODESemanticsProblemData<Self::ParameterType>;
}

/// The models for which we support ODE semantics need to be sufficiently nice, though
/// these bounds are not particularly restrictive.
pub trait DblModelForODESemantics:
    FgCategory + DblModel + MutDblModel<ObGen = QualifiedName, MorGen = QualifiedName> + Clone
{
}

impl DblModelForODESemantics for DiscreteDblModel {}
impl DblModelForODESemantics for DiscreteTabModel {}
impl DblModelForODESemantics for ModalDblModel<Unital> {}
impl DblModelForODESemantics for ModalDblModel<NonUnital> {}

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

impl<P: ODEParameterType> PolynomialODESystemBuilder<P> {
    /// Constructs an empty ODE system.
    pub fn new() -> Self {
        Self::default()
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

/// This trait is where we define the actual ODE semantics, in the implementation of
/// `build_system_builder()`; `build_system()` will almost certainly always use the default
/// implementation given below.
///
/// Note that the type that implements this trait is also where you are expected to state everything
/// that your semantics "cares about". For example, the default minimum is to give the values of
/// `ObType` and `MorType` that you want to distinguish between and iterate over. It can also hold
/// any extra data upon which your semantics can depend (see e.g.
/// `ode::mass_action::PetriNetMassActionAnalysis`, which contains the data of some
/// `MassConservationType`, whose value is fundamental in constructing the semantics). However,
/// this is left to the user: the type checker will *not* enforce any of these extras.
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
    /// Positive contribution: (d/dt)y -= x.
    Positive,
    /// Negative contribution: (d/dt)y += x.
    Negative,
}

/// The trait describing how to turn the formal system of ODEs into a numerical problem, to be
/// solved by an ODE solver and presented to the front-end. At minimum, such data must contain
/// initial values for variables and the intended duration of simulation, as well as the method for
/// converting the parameters (which are of type `ODEParameterType`) into floats.
// REQUEST  | If you look at a struct that implements this trait (such as `LotkaVolterraProblemData`),
//   FOR    | there are a lot of serde statements going on. Should I be able to just move them
// FEEDBACK | (that is, those that come *before* the struct) here and have things all work? I'm still
// _________/ a bit intimidated by all these `crg_attr(feature = "serde")` bits.
//
// #[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
// #[cfg_attr(feature = "serde-wasm", derive(Tsify))]
// #[cfg_attr(
//     feature = "serde-wasm",
//     tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
// )]
pub trait ODESemanticsProblemData<P: ODEParameterType> {
    // REQUEST  | The two getters (`initial_values()` and `duration()`) are annoying boilerplate to
    //   FOR    | ask to be implemented. Is there a nice way to get rid of them here? Without them,
    // FEEDBACK | the call to `self.initial_values` in `build_analysis()` fails because there is no
    // _________/ way of knowing whether a struct implementing this trait actually has those fields.
    /// Map from object IDs to initial values (nonnegative reals).
    fn initial_values(&self) -> HashMap<QualifiedName, f32>;
    /// Duration of simulation.
    fn duration(&self) -> f32;

    /// How to convert the formal parameters of type `ODEParameterType` into floats using values that
    /// will eventually be filled in by the user from the front-end.
    fn extend_scalars(
        &self,
        sys: PolynomialSystem<QualifiedName, Parameter<P>, i8>,
    ) -> PolynomialSystem<QualifiedName, f32, i8>;

    /// Converting the polynomial system into a system ready for use in numerical solvers. The default
    /// implementation here should essentially always be the desired one.
    fn build_analysis(
        &self,
        sys: PolynomialSystem<QualifiedName, f32, i8>,
    ) -> ODEAnalysis<NumericalPolynomialSystem<i8>> {
        let ob_index: IndexMap<_, _> =
            sys.components.keys().cloned().enumerate().map(|(i, x)| (x, i)).collect();
        let n = ob_index.len();

        let initial_values = ob_index
            .keys()
            .map(|ob| self.initial_values().get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let num_sys = sys.to_numerical();
        let problem = ODEProblem::new(num_sys, x0).end_time(self.duration());

        ODEAnalysis::new(problem, ob_index)
    }
}
