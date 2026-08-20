//! Analyses for different ODE semantics on models.
//!
//! Inspired by schema migration, we define the data of an ODE semantics on models in a theory to
//! consist of (in particular) a `PolynomialODESystemBuilder`, which constructs a model of the
//! theory of multicategories (viewed as polynomial ODE systems with abstract coefficients). This
//! is then passed to [`ode::polynomial_ode::PolynomialODEAnalysis`] which constructs from this a
//! `PolynomialSystem`, using `build_system_custom_parameters()`.

//! In short, this module constructs multicategories from models, and [`ode::polynomial_ode`] then
//! constructs `PolynomialSystem` from multicategories.
//!
//! To implement a new ODE semantics for models in some theory, one essentially needs to create an
//! empty struct and implement `ODESemantics`, and then follow the compiler. For more documentation,
//! see [`ode::polynomial_ode`]; for a simple example see [`ode::lotka_volterra`], and for a more
//! complicated example see [`ode::mass_action`].
//!
//! [`ode::polynomial_ode`]: crate::stdlib::analyses::ode::polynomial_ode
//! [`ode::polynomial_ode::PolynomialODEAnalysis`]: crate::stdlib::analyses::ode::polynomial_ode::PolynomialODEAnalysis
//! [`ode::lotka_volterra`]: crate::stdlib::analyses::ode::lotka_volterra
//! [`ode::mass_action`]: crate::stdlib::analyses::ode::mass_action

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
    /// instructive example, see `MassActionParameter` in `ode::mass_action`.
    type ParameterType: ODEParameterType;
    /// The additional configuration data (if any) necessary for generating the system of equations.
    /// For an example, see `mass_action::MassActionEquationsConfig`.
    type EquationsConfigType: ODESemanticsEquationsConfig;
    /// The data describing the things that the ODE semantics "cares about". See the documentation
    /// for `ODESemanticsAnalysis` for more details.
    type AnalysisType: ODESemanticsAnalysis<Self::ModelType, Self::ParameterType, Self::EquationsConfigType>;
    /// The data necessary for simulating the system of equations, to be provided at run-time by the
    /// front-end. For example, which values appear in the front-end analysis widget, and to which
    /// which parameters within the algebraic equations they correspond.
    type ParameterData: ODESemanticsScalarExtension<Self::ParameterType>;
}

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

/// For some ODE semantics, it might be the case there extra information can be given to determine
/// the equations. For example, a boolean describing whether or not mass should be conserved, or
/// something more complicated. This is generally data that will be exposed to the frontend in the
/// corresponding analysis widget. For an example, see `mass_action::MassActionEquationsConfig`.
///
/// Note this this is slightly annoying, and will lead to most ODE semantics requiring us to define
/// `EquationsConfigType = ()` and passing `_equations_config: ()` into `build_system_builder`.
/// It seems likely that we should eventually either (a) break up mass-action semantics into three
/// separate semantics, or (b) have `AdmitsEquationsConfig` as a further separate trait.
pub trait ODESemanticsEquationsConfig: Default {}
impl ODESemanticsEquationsConfig for () {}

/// This trait is where we define the actual ODE semantics, in the implementation of
/// `build_system_builder()`, whereas `build_system()` will almost certainly always use the default
/// implementation given below.
///
/// Note that the type that implements this trait is also where you are expected to state everything
/// that your semantics "cares about". For example, the default minimum is to give the values of
/// `ObType` and `MorType` that you want to distinguish between and iterate over. However,
/// this is left to the user: the type checker will *not* enforce anything helpful here. We
/// recommend looking at any existing implementations to get a better understanding.
pub trait ODESemanticsAnalysis<
    T: DblModelForODESemantics,
    P: ODEParameterType,
    E: ODESemanticsEquationsConfig,
>: Default
{
    /// The implementation of this function is what contains the actual data of the ODE semantics,
    /// in the form of a `PolynomialODESystemBuilder`.
    fn build_system_builder(&self, model: &T, equations_config: E)
    -> PolynomialODESystemBuilder<P>;

    /// We simply feed the `PolynomialODESystemBuilder` constructed by the above function into
    /// `PolynomialODEAnalysis::build_system_custom_parameters` with the *default* values of the
    /// `ODESemanticsEquationsConfig` type.
    fn build_system(&self, model: &T) -> PolynomialSystem<QualifiedName, Parameter<P>, i8> {
        self.build_configured_system(model, E::default())
    }

    /// We simply feed the `PolynomialODESystemBuilder` constructed by the above function into
    /// `PolynomialODEAnalysis::build_system_custom_parameters` with *custom* values of the
    /// `ODESemanticsEquationsConfig` type.
    ///
    /// Note that, if the `ODESemanticsEquationsConfig` in question is trivial, then this function
    /// should essentially never be used, since `build_system` then always does the same.
    fn build_configured_system(
        &self,
        model: &T,
        equations_config: E,
    ) -> PolynomialSystem<QualifiedName, Parameter<P>, i8> {
        let builder = self.build_system_builder(model, equations_config);
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
    /// Positive contribution: (d/dt)y += x.
    Positive,
    /// Negative contribution: (d/dt)y -= x.
    Negative,
}

/// How to convert the formal parameters of type `ODEParameterType` into floats using data from
/// `ODESemanticsProblemData.parameter_data`.
pub trait ODESemanticsScalarExtension<P: ODEParameterType> {
    /// TODO: documentation.
    fn extend_scalars(
        &self,
        system: PolynomialSystem<QualifiedName, Parameter<P>, i8>,
    ) -> PolynomialSystem<QualifiedName, f32, i8>;
}

/// The struct describing how to turn the formal system of ODEs into a numerical problem, to be
/// solved by an ODE solver and presented to the front-end. At minimum, such data must contain
/// initial values for variables and the intended duration of simulation, as well as the method for
/// converting the parameters (which are of type `ODEParameterType`) into floats. Note that it must
/// also contain `ODESemanticsEquationsConfig`, since we need to know how to build the equations
/// before we are able to solve them numerically.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct ODESemanticsProblemData<T>
where
    T: ODESemantics,
{
    /// Further data needed to specify the ODE equations.
    #[cfg_attr(feature = "serde", serde(rename = "equationsConfig"))]
    pub equations_config: T::EquationsConfigType,
    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub initial_values: HashMap<QualifiedName, f32>,
    /// Duration of simulation.
    pub duration: f32,
    /// Data needed to fill in parameters.
    #[cfg_attr(feature = "serde", serde(rename = "parameterData"))]
    pub parameter_data: T::ParameterData,
}

impl<T: ODESemantics> ODESemanticsProblemData<T> {
    /// TODO: docs.
    pub fn extend_scalars(
        &self,
        system: PolynomialSystem<QualifiedName, Parameter<T::ParameterType>, i8>,
    ) -> PolynomialSystem<QualifiedName, f32, i8> {
        self.parameter_data.extend_scalars(system)
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
