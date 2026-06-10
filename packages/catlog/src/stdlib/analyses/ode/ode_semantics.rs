//! Analyses for different ODE semantics on models.
//!
//! Following inspiration from schema migration, we define the data of an ODE semantics on
//! models in a theory to be a migration into the theory of multicategories (more specifically,
//! [`th_polynomial_ode_system()`]). We then simply use the "canonical" interpretation of
//! multicategories as systems of polynomial ODEs as implemented in [`ode::polynomial_ode`]
//! (and see there also for documentation on this interpretation of models as systems of ODEs).
//!
//! That is, we take some `model: T` where `T: DblModelForODESemantics`, and from this use
//! `ODESemanticsAnalysis::build_semantics()` to build `ode_model: ModalDblModel` (to be
//! understood as a model for [`th_polynomial_ode_system()`]), and finally use
//! [`ode::polynomial_ode`] to build `system: PolynomialSystem<QualifiedName, Parameter<P>, i8>`
//! where `P: ODEParameterType`. Finally, for an actual front-end analysis, we use
//! `ODESemanticsProblemData::extend_scalars()` and `ODESemanticsProblemData::build_analysis()`
//! to construct `analysis: ODEAnalysis<NumericalPolynomialSystem<i8>>`, which we can feed into
//! the ODE solver.
//!
//! To implement a new ODE semantics for models in some theory, one essentially needs to create
//! an empty struct and implement `ODESemantics`, and then follow the compiler.
//!
//! [`th_polynomial_ode_system()`]: crate::stdlib::theories
//! [`ode::polynomial_ode`]: crate::stdlib::analyses::ode::polynomial_ode

use indexmap::IndexMap;
use nalgebra::DVector;
use std::{collections::HashMap, fmt, rc::Rc};

use crate::{
    dbl::{
        modal::{List, ModeApp},
        model::{DiscreteDblModel, DiscreteTabModel, ModalDblModel, ModalOb, MutDblModel},
        theory::{NonUnital, Unital},
    },
    one::FgCategory,
    simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem},
    stdlib::{
        analyses::ode::{ODEAnalysis, Parameter, PolynomialODEAnalysis},
        th_signed_polynomial_ode_system,
    },
    zero::{QualifiedName, name},
};

/// Builder for polynomial ODE systems.
///
/// This struct is just a convenient interface to construct a model of the
/// [theory of polynomial ODE systems](th_polynomial_ode_system). Being an
/// ordinary mutable Rust struct, it does *not* constitute a declarative
/// language to define ODE semantics for models of other theories. However, the
/// idea is that it should be used in a style that can mechanically translated
/// to a future declarative language for model migration.
///
/// Since an ODE semantics often has contributions of several types, a useful
/// pattern is to use qualified names with an initial segment indicating the
/// type of contribution. This corresponds to a model migration in which the
/// contributions arise as a coproduct of several queries.
pub struct PolynomialODESystemBuilder {
    model: ModalDblModel<NonUnital>,
}

impl Default for PolynomialODESystemBuilder {
    fn default() -> Self {
        let th = th_signed_polynomial_ode_system();
        Self { model: ModalDblModel::new(th.into()) }
    }
}

impl PolynomialODESystemBuilder {
    /// Constructs an empty ODE system.
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns a model of the theory of polynomial ODE systems.
    pub fn model(self) -> ModalDblModel<NonUnital> {
        self.model
    }

    // TODO: add_variable() and add_contribution() should both do something to associated_parameters

    /// Adds a state variable to the ODE system.
    pub fn add_variable(&mut self, var: QualifiedName) {
        self.model.add_ob(var, ModeApp::new(name("State")));
    }

    /// Adds a contribution to the ODE system.
    pub fn add_contribution(
        &mut self,
        id: QualifiedName,
        var: QualifiedName,
        monomial: impl IntoIterator<Item = QualifiedName>,
    ) {
        let monomial = monomial.into_iter().map(ModalOb::Generator).collect();
        // TODO: we land in *signed* polynomial ODEs, so we should worry about the sign
        self.model.add_mor(
            id,
            ModalOb::List(List::Symmetric, monomial),
            ModalOb::Generator(var),
            ModeApp::new(name("Contribution")).into(),
        )
    }
}

/// The trait for an ODE semantics on models.
pub trait ODESemantics {
    /// The type of the model for which these ODE semantics are intended.
    type ModelType: DblModelForODESemantics;
    /// The type of the parameters associated to each contribution in the multicategory
    /// built from the model. The "default" value for this would be `QualifiedName`, but
    /// it can be useful to have a more descriptive type. For example, we might wish for
    /// certain parameters to be identified with one another, or to be rendered differently
    /// in debug/LaTeX output. An instructive example of this is `LotkaVolterraParameter`;
    /// a more complicated example is `MassActionParameter`.
    type ParameterType: ODEParameterType;
    /// The data describing the things that the ODE semantics "cares about". (See the
    /// documentation for `ODESemanticsAnalysis`).
    type AnalysisType: ODESemanticsAnalysis<Self::ModelType, Self::ParameterType>;
    /// The data describing how to turn the algebraic system of equations into a simulation,
    /// including e.g. which values that appear in the front-end analysis correspond to
    /// which parameters within the equations.
    type ProblemDataType: ODESemanticsProblemData<Self::ParameterType>;
}

/// The models for which we support ODE semantics need to be sufficiently nice, though
/// these bounds are not particularly restrictive.
pub trait DblModelForODESemantics:
    FgCategory + MutDblModel<ObGen = QualifiedName, MorGen = QualifiedName> + Clone
{
}

impl DblModelForODESemantics for DiscreteDblModel {}
impl DblModelForODESemantics for DiscreteTabModel {}
impl DblModelForODESemantics for ModalDblModel<Unital> {}
impl DblModelForODESemantics for ModalDblModel<NonUnital> {}

/// The type of the parameters in the ODE system need to be sufficiently nice, though
/// (again) these bounds are not particularly restrictive.
pub trait ODEParameterType: Eq + Ord + Clone + fmt::Display {}

/// This trait is where we give the actual functions for building the data that
/// `build_system_from_ode_semantics()` needs in order to construct
/// the multicategory. The implementation of `build_semantics()` is where the actual
/// migration (i.e. the actual ODE semantics) is specified, but `build_system()` can
/// essentially always use the default implementation given below.
///
/// Note that the type that implements this trait is also where you are expected to state
/// everything that your semantics "cares about". For example, the expected minimum is to
/// give the values of `ObType` and `MorType` that you want to distinguish between and
/// iterate over. It can also hold any extra data upon which your semantics can depend
/// (see e.g. `ode::mass_action::PetriNetMassActionAnalysis`, which contains the data of
/// some `MassConservationType`, whose value is fundamental in constructing the semantics).
/// However, this is left to the user: the type checker will not enforce any of these extras.
pub trait ODESemanticsAnalysis<T: DblModelForODESemantics, P: ODEParameterType>: Default {
    /// Construct the data required by `build_system_from_ode_semantics()`
    /// to actually build the multicategory.
    fn build_semantics(&self) -> ODESemanticsBuilder<T, P>;

    // TODO: SWITCH THIS AROUND! i.e. from here we should EXPOSE add_contribution() functions
    //          and then e.g. lotka_volterra.rs should USE them (we pop out a new blank ODESemantics
    //          and lotka_volterra populates it)
    /// Construct the polynomial system from the `ODESemanticsBuilder`. This default
    /// implementation should hopefully essentially always be the desired one.
    fn build_system(&self, model: &T) -> PolynomialSystem<QualifiedName, Parameter<P>, i8> {
        build_system_from_ode_semantics::<T, P>(model, self.build_semantics())
    }
}

/// The data required by `build_system_from_ode_semantics()` consists of
/// information on how to construct *variables* (objects) and *contributions* (multimorphisms).
pub struct ODESemanticsBuilder<T: DblModelForODESemantics, P: ODEParameterType> {
    /// The list of terms of `T::ObType` to iterate over when constructing variables in the
    /// ODE system.
    pub variable_builders: Vec<ODEVariableBuilder<T>>,
    /// The list of terms of `T::ObType` and of `T::MorType` to iterate over when constructing
    /// contributions in the ODE system, along with the corresponding migrations.
    pub contribution_builders: Vec<ODEContributionBuilder<T, P>>,
}

/// The type that describes how to construct *variables* in the ODE system.
pub enum ODEVariableBuilder<T: DblModelForODESemantics> {
    /// Construct variables from *objects* in the original model.
    Object {
        /// The type of objects in the original model to use to construct variables.
        /// In short, this is used in `ode::polynomial_ode` in the following way:
        /// ```ignore
        /// for ob in model.ob_generators_with_type(&self.variable_ob_type) {
        ///    sys.add_term(ob, Polynomial::zero());
        /// }
        /// ```
        ob_type: T::ObType,
    },
    // N.B. Constructing variables from *morphisms* in the original model is not currently
    // supported, but would be useful for e.g. "span migration", where flows x--[f]->y in a stock-flow
    // diagram are viewed as spans x<-f->y and so a new apex variable f needs to be created.
}

/// The type that describes how to construct *contributions* in the ODE system.
pub enum ODEContributionBuilder<T: DblModelForODESemantics, P: ODEParameterType> {
    /// Construct contributions from *variables* in the original model.
    Object {
        /// The type(s) of objects in the original model to use to construct variables.
        /// Analogous to `ODEVariableBuilder::Object`, this is used to iterate over in
        /// `ode::polynomial_ode`. The only extra data here is that of a term of type
        /// `ContributionSign`, which happens to be a convenient way of reducing duplication
        /// in the existing ODE semantics. For example, in all current ODE semantics on
        /// CLDs, the migration defined on positive links and the one on negative links are
        /// identical in terms of their monomial, target, and parameter, but differ in the
        /// *sign* of the contribution. However, this is purely a convention of convenience,
        /// i.e. there is no good mathematical reason to put this data here instead of inside
        /// `ob_contributions`. Indeed, at some point it might be more sensible to move it there.
        ob_types_and_signs: Vec<(T::ObType, ContributionSign)>,
        /// A list of contributions, as described in `Contribution`.
        ob_contributions: Vec<fn(ob: &T::ObGen, model: &T) -> Vec<Contribution<P>>>,
    },
    /// Construct contributions from *morphisms* in the original model.
    Morphism {
        /// Analogous to `Object.ob_types_and_signs`, but for morphisms types.
        mor_types_and_signs: Vec<(T::MorType, ContributionSign)>,
        /// A list of contributions, as described in `Contribution`.
        mor_contributions: Vec<fn(mor: &T::MorGen, model: &T) -> Vec<Contribution<P>>>,
    },
}

/// A contribution to the ODE system consists of all the data that `ModalDblModel::add_mor()`
/// requires to create a multimorphism.
#[derive(Clone)]
pub struct Contribution<P: ODEParameterType> {
    /// The name of the multimorphism.
    pub name: QualifiedName,
    /// The source of the multimorphism (a list of objects), to be interpreted
    /// as the monomial given by the product of all the list elements.
    pub monomial: Vec<QualifiedName>,
    /// The parameter (coefficient) to be associated with this contribution.
    pub parameter: P,
    /// The target of the multimorphism, to be interpreted as the variable whose
    /// first derivative is affected by the monomial.
    pub target: QualifiedName,
}

/// The sign of the contribution, since we work in *signed* multicategories.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Copy)]
pub enum ContributionSign {
    /// Positive contribution: (d/dt)y -= x.
    Positive,
    /// Negative contribution: (d/dt)y += x.
    Negative,
}

/// The trait describing how to turn the formal system of ODEs into a numerical problem, to be
/// solved by an ODE solver and presented to the front-end. At minimum, such data must contain
/// initial values for variables and the intended duration of simulation, as well as the method
/// for converting the parameters (which are of type `ODEParameterType`) into floats.
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

/// The main function of this module: taking the data of an `ODESemanticsBuilder<T,P>`
/// and constructing a `PolynomialSystem` (with parameters of type `P`). We first construct
/// `ode_model: ModalDblModel<NonUnital>` in the theory of signed polynomial ODE systems,
/// along with a hash map of parameters associated to names. This data is precisely what we
/// need to then simply call `PolynomialODEAnalysis::default().build_system_custom_parameters`
/// to build the desired `PolynomialSystem`.
pub fn build_system_from_ode_semantics<T, P>(
    // TODO: this should now take in some PolynomialODESystemBuilder instead of
    //       the now-deleted ODESemanticsBuilder
    model: &T,
    ode_semantics: ODESemanticsBuilder<T, P>,
) -> PolynomialSystem<QualifiedName, Parameter<P>, i8>
where
    T: DblModelForODESemantics,
    P: ODEParameterType,
{
    let ode_theory = Rc::new(th_signed_polynomial_ode_system());
    let mut ode_model = ModalDblModel::new(ode_theory);

    let ode_analysis = PolynomialODEAnalysis::default();
    let ode_ob_type = ode_analysis.variable_ob_type;
    let ode_pos_cont_type = ode_analysis.positive_contribution_mor_type;
    let ode_neg_cont_type = ode_analysis.negative_contribution_mor_type;

    let mut associated_parameters: HashMap<QualifiedName, P> = HashMap::new();

    for var_build in ode_semantics.variable_builders {
        let ODEVariableBuilder::Object { ob_type } = var_build;
        for ob in model.ob_generators_with_type(&ob_type) {
            ode_model.add_ob(ob, ode_ob_type.clone());
        }
    }

    let apply_contribution = {
        |contribution: Contribution<P>,
         sign: ContributionSign,
         associated_parameters: &mut HashMap<QualifiedName, P>,
         ode_model: &mut ModalDblModel<NonUnital>| {
            associated_parameters.insert(contribution.name.clone(), contribution.parameter);
            ode_model.add_mor(
                contribution.name,
                ModalOb::List(
                    List::Symmetric,
                    contribution
                        .monomial
                        .iter()
                        .map(|var| ModalOb::Generator(var.clone()))
                        .collect(),
                ),
                ModalOb::Generator(contribution.target),
                match sign {
                    ContributionSign::Positive => ode_pos_cont_type.clone(),
                    ContributionSign::Negative => ode_neg_cont_type.clone(),
                },
            )
        }
    };

    // REQUEST  | The below is the most naive way of doing this, but it involves a *lot* of nested
    //   FOR    | loops. Is there a nicer way of doing this? Note that both arms of the `match`
    // FEEDBACK | are essentially identical, differing only in their use of `ob_generators_with_type`
    // _________/ versus `mor_generators_with_type`.
    for cont_build in ode_semantics.contribution_builders {
        match cont_build {
            ODEContributionBuilder::Object { ob_types_and_signs, ob_contributions } => {
                for (ob_type, sign) in ob_types_and_signs {
                    for ob in model.ob_generators_with_type(&ob_type) {
                        for contribution in ob_contributions.clone() {
                            for contribution in contribution(&ob, model) {
                                apply_contribution(
                                    contribution.clone(),
                                    sign,
                                    &mut associated_parameters,
                                    &mut ode_model,
                                )
                            }
                        }
                    }
                }
            }
            ODEContributionBuilder::Morphism { mor_types_and_signs, mor_contributions } => {
                for (mor_type, sign) in mor_types_and_signs {
                    for mor in model.mor_generators_with_type(&mor_type) {
                        for contribution in mor_contributions.clone() {
                            for contribution in contribution(&mor, model) {
                                apply_contribution(
                                    contribution.clone(),
                                    sign,
                                    &mut associated_parameters,
                                    &mut ode_model,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    PolynomialODEAnalysis::default()
        .build_system_custom_parameters(&ode_model, associated_parameters)
}
