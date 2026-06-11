//! Instances of models of a double theory.
//!
//! An **instance** of a model presents a fibered structure over the model:
//! a set of generators living over each object of the model, together with
//! equations between terms built from morphisms of the model applied to
//! those generators. Crucially, the equations are stated *abstractly*: the
//! lift targets and lift morphisms forced by the discrete-opfibration
//! condition are *not* materialized as explicit generators. This is what
//! makes the data structure suited to "minimalist" presentations such as
//! the ones produced by the `diagram` form in DoubleTT.
//!
//! The term language is left to each doctrine to define, via the
//! [`InstanceTerm`] trait and the [`HasInstanceTerm`] extension on
//! [`DblModel`]. Discrete doctrines typically need only bare generators
//! and morphism applications; modal doctrines additionally allow list
//! terms to feed list-shaped morphism domains.
//!
//! For the related but distinct notion of a *diagram* in a model — a
//! morphism into the model from a free model — see
//! [`model_diagram`](super::model_diagram).

use std::rc::Rc;

use super::model::DblModel;
use crate::one::Category;
use crate::zero::{Column, HashColumn, MutMapping, QualifiedName};

/// A term in the language of an instance of some model.
///
/// Each doctrine implements its own concrete term type. The associated
/// [`Mor`](Self::Mor) type ties the term language to a particular
/// model's morphism type.
pub trait InstanceTerm {
    /// Morphism type from the associated model that this term language
    /// can apply to its arguments.
    type Mor;
}

/// A [`DblModel`] that has an associated term language for instances.
///
/// Each doctrine that wants to support [`DblModelInstance`] declares its
/// term type here.
pub trait HasInstanceTerm: DblModel {
    /// The kind of term used to express equations in instances of this
    /// model.
    type Term: InstanceTerm<Mor = <Self as Category>::Mor>;
}

/// An instance of a model: a set of fibered generators plus equations
/// between terms in the model's instance-term language.
///
/// Owns the generator-to-fiber assignment and the equations, but does
/// not own the model itself (held behind an [`Rc`], matching how models
/// reference their theories).
pub struct DblModelInstance<M: HasInstanceTerm> {
    model: Rc<M>,
    /// For each instance generator, the model object it lives over.
    /// Multiple generators may share a fiber.
    fibers: HashColumn<QualifiedName, M::Ob>,
    /// Equations between terms, asserted to hold in this instance.
    equations: Vec<(M::Term, M::Term)>,
}

impl<M: HasInstanceTerm> DblModelInstance<M> {
    /// Creates an empty instance over the given model.
    pub fn new(model: Rc<M>) -> Self {
        Self {
            model,
            fibers: Default::default(),
            equations: Vec::new(),
        }
    }

    /// The model this is an instance of.
    pub fn model(&self) -> &Rc<M> {
        &self.model
    }

    /// Adds a generator living over the given object of the model.
    pub fn add_generator(&mut self, name: QualifiedName, fiber: M::Ob) {
        self.fibers.set(name, fiber);
    }

    /// The model object that `name` lives over, if `name` is a generator
    /// of this instance.
    pub fn fiber_of(&self, name: &QualifiedName) -> Option<&M::Ob> {
        self.fibers.get(name)
    }

    /// Iterates over the instance generators and their fibers.
    pub fn generators(&self) -> impl Iterator<Item = (QualifiedName, &M::Ob)> {
        self.fibers.iter()
    }

    /// Adds an equation between two terms.
    pub fn add_equation(&mut self, lhs: M::Term, rhs: M::Term) {
        self.equations.push((lhs, rhs));
    }

    /// Iterates over the equations of this instance.
    pub fn equations(&self) -> impl Iterator<Item = &(M::Term, M::Term)> {
        self.equations.iter()
    }
}
