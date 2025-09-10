/*! Data structures for managing toplevel declarations in the type theory.

Specifically, notebooks will produce [TopDecl::Type] declarations.
*/
use std::fmt;

use crate::{
    dbl::theory::DiscreteDblTheory,
    tt::{prelude::*, stx::*, val::*},
};

/// A toplevel declaration.
pub enum TopDecl {
    /** A toplevel declaration of a type.

    Also stores the evaluation of that type. Because this is an evaluation in
    the empty context, this is OK to use in any other context as well.
    */
    Type(TyS, TyV),
    /** A toplevel declaration of a term.

    Also stores the evaluation of that term, and the evaluation of the corresponding type of that term. Because this is an evaluation in the
    empty context, this is OK to use in any other context as well.
    */
    Term(TmS, TmV, TyV),
}

impl TopDecl {
    /** Extract the type for a toplevel-declaration of a type.

    This should only be used after type checking, when we know that a toplevel
    variable name does in fact point to a toplevel declaration for a type.
    */
    pub fn as_ty(&self) -> TyV {
        match self {
            TopDecl::Type(_, ty) => ty.clone(),
            _ => panic!("expected type"),
        }
    }

    /** Extract the term for a toplevel-declaration of a term.

    This should only be used after type checking, when we know that a toplevel
    variable name does in fact point to a toplevel declaration for a term.
    */
    pub fn as_tm(&self) -> TmV {
        match self {
            TopDecl::Term(_, tm, _) => tm.clone(),
            _ => panic!("expected type"),
        }
    }
}

impl fmt::Display for TopDecl {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TopDecl::Type(ty_s, _) => write!(f, "{}", ty_s),
            TopDecl::Term(tm_s, _, _) => write!(f, "{}", tm_s),
        }
    }
}

/** Storage for toplevel declarations. */
pub struct Toplevel {
    /// The theory that we are elaborating with respect to
    pub theory: DiscreteDblTheory,
    /// The toplevel declarations, indexed by their name.
    pub declarations: HashMap<TopVarName, TopDecl>,
}

impl Toplevel {
    /// Constructor for an empty [Toplevel].
    pub fn new(theory: DiscreteDblTheory) -> Self {
        Toplevel {
            theory,
            declarations: HashMap::new(),
        }
    }

    /// Lookup a toplevel declaration by name.
    pub fn lookup(&self, name: TopVarName) -> Option<&TopDecl> {
        self.declarations.get(&name)
    }
}
