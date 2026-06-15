//! Data structures for managing toplevel declarations in the type theory.
//!
//! Specifically, notebooks will produce [TopDecl::Type] declarations, or
//! [TopDecl::DefConst] declarations.

use derive_more::Constructor;

use super::{prelude::*, stx::*, theory::*, val::*};
use crate::zero::QualifiedName;

/// A toplevel declaration.
#[derive(Clone)]
pub enum TopDecl {
    /// See [Type].
    Type(Type),
    /// See [DefConst].
    DefConst(DefConst),
    /// See [Def].
    Def(Def),
}

/// A toplevel declaration of a type.
///
/// Also stores the evaluation of that type. Because this is an evaluation in
/// the empty context, this is OK to use in any other context as well.
#[derive(Constructor, Clone)]
pub struct Type {
    /// The theory for the type.
    pub theory: Theory,
    /// The syntax of the type (unnormalized).
    pub stx: TyS,
    /// The value of the type (normalized).
    pub val: TyV,
}

/// A toplevel declaration of a term in the empty context.
///
/// Also stores the evaluation of that term, and the evaluation of the
/// corresponding type of that term. Because this is an evaluation in the empty
/// context, this is OK to use in any other context as well.
///
/// An *instance* of a model is just such a term whose [`val`](Self::val) is a
/// [`TmV_::Instance`](super::val::TmV_::Instance): a generator/equation/
/// sub-instance body packaged as an introduction value of a record type.
/// When an instance name is used in *type* position (for a
/// sub-instance import), its type is the record type synthesized from that body
/// by [`synth_instance_body_ty`](super::eval::Evaluator::synth_instance_body_ty).
#[derive(Constructor, Clone)]
pub struct DefConst {
    /// The theory that the constant is defined in.
    pub theory: Theory,
    /// The syntax of the constant (unnormalized).
    pub stx: TmS,
    /// The value of the constant (normalized).
    pub val: TmV,
    /// The type of the constant.
    pub ty: TyV,
}

/// A toplevel declaration of a term judgment.
#[derive(Constructor, Clone)]
pub struct Def {
    /// The theory that the definition is defined in.
    pub theory: Theory,
    /// The arguments for the definition.
    pub args: Row<TyS>,
    /// The return type of the definition (to be evaluated in an environment
    /// with values for the arguments).
    pub ret_ty: TyS,
    /// The body of the definition (to be evaluated in an environment with
    /// values for the arguments).
    pub body: TmS,
}

impl TopDecl {
    /// Unwraps the type for a toplevel-declaration of a type, or panics.
    ///
    /// This should only be used after type checking, when we know that a toplevel
    /// variable name does in fact point to a toplevel declaration for a type.
    pub fn unwrap_ty(self) -> Type {
        match self {
            TopDecl::Type(ty) => ty,
            _ => panic!("top-level should be a type declaration"),
        }
    }

    /// Unwraps the term for a toplevel declaration of a term, or panics.
    ///
    /// This should only be used after type checking, when we know that a toplevel
    /// variable name does in fact point to a toplevel declaration for a term.
    pub fn unwrap_const(self) -> DefConst {
        match self {
            TopDecl::DefConst(d) => d,
            _ => panic!("top-level should be a constant declaration"),
        }
    }

    /// Unwraps the definition for a toplevel term judgment, or panics.
    pub fn unwrap_def(self) -> Def {
        match self {
            TopDecl::Def(d) => d,
            _ => panic!("top-level should be a term judgment"),
        }
    }
}

/// Storage for toplevel declarations.
#[derive(Default)]
pub struct Toplevel {
    /// Library of theories, indexed by name.
    pub theory_library: HashMap<QualifiedName, Theory>,
    /// The toplevel declarations, indexed by their name.
    pub declarations: HashMap<TopVarName, TopDecl>,
}

impl Toplevel {
    /// Constructs an empty [Toplevel].
    pub fn new(theory_library: HashMap<QualifiedName, Theory>) -> Self {
        Toplevel {
            theory_library,
            declarations: HashMap::new(),
        }
    }

    /// Lookup a toplevel declaration by name.
    pub fn lookup(&self, name: TopVarName) -> Option<&TopDecl> {
        self.declarations.get(&name)
    }
}
