//! Models of double theories.
//!
//! A model of a double theory is a category (or categories) equipped with
//! operations specified by the theory, categorifying the familiar idea from logic
//! that a model of a theory is a set (or sets) equipped with operations. For
//! background on double theories, see the [`theory`](super::theory) module.
//!
//! In the case of a *simple* double theory, which amounts to a small double
//! category, a **model** of the theory is a span-valued *lax* double functor out of
//! the theory. Such a model is a "lax copresheaf," categorifying the notion of a
//! copresheaf or set-valued functor. Though they are "just" lax double functors,
//! models come with extra intuitions. To bring that out we introduce new jargon,
//! building on that for double theories.
//!
//! # Terminology
//!
//! A model of a double theory consists of elements of two kinds:
//!
//! 1. **Objects**, each assigned an object type in the theory;
//!
//! 2. **Morphisms**, each having a domain and a codomain object and assigned a
//!    morphism type in the theory, compatibly with the domain and codomain types;
//!
//! In addition, a model has the following operations:
//!
//! - **Object action**: object operations in the theory act on objects in the model
//!   to produce new objects;
//!
//! - **Morphism action**: morphism operations in the theory act on morphisms in
//!   the model to produce new morphisms, compatibly with the object action;
//!
//! - **Composition**: a path of morphisms in the model has a composite morphism,
//!   whose type is the composite of the corresponding morphism types.

use derivative::Derivative;
use nonempty::NonEmpty;
use std::rc::Rc;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::theory::DblTheory;
use crate::one::{Category, FgCategory, InvalidPathEq, Path, PathEq};
use crate::tt::util::pretty::*;
use crate::zero::{Namespace, QualifiedName};

pub use super::discrete::model::*;
pub use super::discrete_tabulator::model::*;
pub use super::modal::model::*;

/// A model of a double theory.
///
/// As always in logic, a model makes sense only relative to a theory, but a
/// theory can have many different models. So, when implemented Rust, a model
/// needs access to its theory but should not *own* its theory. Implementors of
/// this trait are assumed to own to a reference-counting pointer to the theory.
///
/// Objects and morphisms in a model are typed by object types and morphism types in
/// the theory. There is a design choice about whether identifiers for objects
/// ([`Ob`](Category::Ob)) and morphisms ([`Mor`](Category::Mor)) are unique
/// relative to their types or globally within the model. If we took the first
/// approach (as we do in the Julia package
/// [ACSets.jl](https://github.com/AlgebraicJulia/ACSets.jl)), one could only make
/// sense of objects and morphisms when their types are known, so the early methods
/// in the trait would look like this:
///
/// ```ignore
/// fn has_ob(&self, x: &Self::Ob, t: &Self::ObType) -> bool;
/// fn has_mor(&self, m: &Self::Mor, t: &Self::MorType) -> bool;
/// fn dom(&self, m: &Self::Mor, t: &Self::MorType) -> Self::Ob;
/// fn cod(&self, m: &Self::Mor, t: &Self::MorType) -> Self::Ob;
/// ```
///
/// It will be more convenient for us to take the second approach since in our usage
/// object and morphism identifiers will be globally unique in a very strong sense
/// (something like UUIDs).
pub trait DblModel: Category {
    /// Rust type of object types defined in the theory.
    type ObType: Eq;

    /// Rust type of morphism types defined in the theory.
    type MorType: Eq;

    /// Type of operations on objects defined in the theory.
    type ObOp: Eq;

    /// Type of operations on morphisms defined in the theory.
    type MorOp: Eq;

    /// The type of double theory that this is a model of.
    type Theory: DblTheory<
            ObType = Self::ObType,
            MorType = Self::MorType,
            ObOp = Self::ObOp,
            MorOp = Self::MorOp,
        >;

    /// The double theory that this model is a model of.
    fn theory(&self) -> Rc<Self::Theory>;

    /// Type of an object.
    fn ob_type(&self, x: &Self::Ob) -> Self::ObType;

    /// Type of a morphism.
    fn mor_type(&self, m: &Self::Mor) -> Self::MorType;

    /// Acts on an object with an object operation.
    fn ob_act(&self, x: Self::Ob, f: &Self::ObOp) -> Self::Ob;

    /// Acts on a sequence of morphisms with a morphism operation.
    fn mor_act(&self, path: Path<Self::Ob, Self::Mor>, α: &Self::MorOp) -> Self::Mor;
}

/// A finitely generated model of a double theory.
pub trait FgDblModel: DblModel + FgCategory {
    /// Type of an object generator.
    fn ob_generator_type(&self, ob: &Self::ObGen) -> Self::ObType;

    /// Type of a morphism generator.
    fn mor_generator_type(&self, mor: &Self::MorGen) -> Self::MorType;

    /// Iterates over object generators with the given object type.
    fn ob_generators_with_type(&self, obtype: &Self::ObType) -> impl Iterator<Item = Self::ObGen> {
        self.ob_generators().filter(|ob| self.ob_generator_type(ob) == *obtype)
    }

    /// Iterates over morphism generators with the given morphism type.
    fn mor_generators_with_type(
        &self,
        mortype: &Self::MorType,
    ) -> impl Iterator<Item = Self::MorGen> {
        self.mor_generators().filter(|mor| self.mor_generator_type(mor) == *mortype)
    }

    /// Iterators over basic objects with the given object type.
    fn objects_with_type(&self, obtype: &Self::ObType) -> impl Iterator<Item = Self::Ob> {
        self.ob_generators_with_type(obtype).map(|ob_gen| ob_gen.into())
    }

    /// Iterates over basic morphisms with the given morphism type.
    fn morphisms_with_type(&self, mortype: &Self::MorType) -> impl Iterator<Item = Self::Mor> {
        self.mor_generators_with_type(mortype).map(|mor_gen| mor_gen.into())
    }
}

/// A mutable, finitely generated model of a double theory.
pub trait MutDblModel: FgDblModel {
    /// Adds an object generator to the model.
    fn add_ob(&mut self, x: Self::ObGen, ob_type: Self::ObType);

    /// Adds a morphism generator to the model.
    fn add_mor(&mut self, f: Self::MorGen, dom: Self::Ob, cod: Self::Ob, mor_type: Self::MorType) {
        self.make_mor(f.clone(), mor_type);
        self.set_dom(f.clone(), dom);
        self.set_cod(f, cod);
    }

    /// Adds a morphism generator to the model without setting its (co)domain.
    fn make_mor(&mut self, f: Self::MorGen, mor_type: Self::MorType);

    /// Gets the domain of a morphism generator, if it is set.
    fn get_dom(&self, f: &Self::MorGen) -> Option<&Self::Ob>;

    /// Gets the codomain of a morphism generator, if it is set.
    fn get_cod(&self, f: &Self::MorGen) -> Option<&Self::Ob>;

    /// Sets the domain of a morphism generator.
    fn set_dom(&mut self, f: Self::MorGen, x: Self::Ob);

    /// Sets the codomain of a morphism generator.
    fn set_cod(&mut self, f: Self::MorGen, x: Self::Ob);
}

/// A pretty-printable model of a double theory.
///
/// One would assume that a printable model should have a printable theory, but
/// we haven't bothered to implement pretty printing for theories. So, for now,
/// we include only what we need of theory pretty printer---printing object and
/// morphism types---as extra methods here.
pub trait PrintableDblModel: FgDblModel<ObGen = QualifiedName, MorGen = QualifiedName> {
    /// Pretty prints an object in the model.
    fn ob_to_doc<'a>(&self, ob: &Self::Ob, ob_ns: &Namespace, mor_ns: &Namespace) -> D<'a>;

    /// Pretty prints a morphism in the model.
    fn mor_to_doc<'a>(&self, mor: &Self::Mor, ob_ns: &Namespace, mor_ns: &Namespace) -> D<'a>;

    /// Gets the equations in the model, if any.
    fn equations(&self) -> Vec<PathEq<Self::Ob, Self::MorGen>> {
        Vec::new()
    }

    /// Pretty prints an equation in the model.
    fn eqn_to_doc<'a>(
        &self,
        _eqn: &PathEq<Self::Ob, Self::MorGen>,
        _ob_ns: &Namespace,
        _mor_ns: &Namespace,
    ) -> D<'a> {
        unreachable!() //Default implementation models have no equations, so won't call this.
    }

    /// Pretty prints an object type in the model's theory.
    fn ob_type_to_doc<'a>(ob_type: &Self::ObType) -> D<'a>;

    /// Pretty prints a morphism type in the model's theory.
    fn mor_type_to_doc<'a>(mor_type: &Self::MorType) -> D<'a>;
}

/// Pretty-printer for models of double theories.
#[derive(Derivative)]
#[derivative(Default(new = "true"))]
pub struct DblModelPrinter {
    #[derivative(Default(value = "true"))]
    include_summary: bool,
}

impl DblModelPrinter {
    /// Sets whether to show summary at beginning of model printout.
    pub fn include_summary(mut self, value: bool) -> Self {
        self.include_summary = value;
        self
    }

    /// Generates a summary string for the model.
    pub fn summary(&self, model: &impl PrintableDblModel) -> String {
        let n_ob = model.ob_generators().count();
        let n_mor = model.mor_generators().count();
        format!(
            "model generated by {n_ob} object{} and {n_mor} morphism{}",
            if n_ob != 1 { "s" } else { "" },
            if n_mor != 1 { "s" } else { "" },
        )
    }

    /// Pretty prints a model (with empty namespaces).
    pub fn doc<'a>(&self, model: &impl PrintableDblModel) -> D<'a> {
        let ns = Namespace::new_for_text();
        self.namespaced_doc(model, &ns, &ns)
    }

    /// Pretty prints a model with labels from the given namespaces.
    pub fn namespaced_doc<'a, Model: PrintableDblModel>(
        &self,
        model: &Model,
        ob_ns: &Namespace,
        mor_ns: &Namespace,
    ) -> D<'a> {
        let ob_entries = model.ob_generators().map(|name| {
            t(ob_ns.label_string(&name))
                + t(" : ")
                + Model::ob_type_to_doc(&model.ob_generator_type(&name))
        });
        let ob_section = intersperse(ob_entries, hardline());

        let mor_entries = model.mor_generators().map(|name| {
            t(mor_ns.label_string(&name))
                + t(" : ")
                + model.ob_to_doc(&model.mor_generator_dom(&name), ob_ns, mor_ns)
                + t(" -> ")
                + model.ob_to_doc(&model.mor_generator_cod(&name), ob_ns, mor_ns)
                + t(" : ")
                + Model::mor_type_to_doc(&model.mor_generator_type(&name))
        });
        let mor_section = hardline() + intersperse(mor_entries, hardline());

        let eqns = model.equations();
        let eqn_section = if eqns.is_empty() {
            t("")
        } else {
            let eqn_entries = eqns.iter().map(|eqn| model.eqn_to_doc(eqn, ob_ns, mor_ns));
            hardline() + intersperse(eqn_entries, hardline())
        };
        let result = ob_section + mor_section + eqn_section;
        if self.include_summary {
            t(self.summary(model)) + hardline() + result
        } else {
            result
        }
    }
}

/// A failure of a model of a double theory to be well defined.
///
/// TODO: We are missing the case that an equation has different composite morphism
/// types on left and right hand sides.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum InvalidDblModel {
    /// Domain of morphism generator is undefined or invalid.
    Dom(QualifiedName),

    /// Codomain of morphism generator is missing or invalid.
    Cod(QualifiedName),

    /// Object generator has invalid object type.
    ObType(QualifiedName),

    /// Morphism generator has invalid morphism type.
    MorType(QualifiedName),

    /// Domain of morphism generator has type incompatible with morphism type.
    DomType(QualifiedName),

    /// Codomain of morphism generator has type incompatible with morphism type.
    CodType(QualifiedName),

    /// Equation between morphisms has one or more errors.
    Eq(usize, NonEmpty<InvalidPathEq>),

    /// Tried to us a feature not yet supported by the elaborator.
    UnsupportedFeature(Feature),

    /// No link provided for instantiation cell, or wrong type of link.
    InvalidLink(QualifiedName),
}

/// Various features that the new elaboration does not yet support.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum Feature {
    /// Morphism type that is not a basic type or a hom type.
    ComplexMorType,
}
