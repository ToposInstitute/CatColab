/*! Data structures for managing toplevel declarations in the type theory.

Specifically, notebooks will produce [TopDecl::Type] declarations.
*/

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
    /** A toplevel declaration of a term in the empty context.

    Also stores the evaluation of that term, and the evaluation of the corresponding type of that term. Because this is an evaluation in the
    empty context, this is OK to use in any other context as well.
    */
    DefConst(TmS, TmV, TyV),
    /** A toplevel declaration of a term judgment */
    Def(Row<TyS>, TyS, TmS),
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

    /** Extract the term for a toplevel declaration of a term.

    This should only be used after type checking, when we know that a toplevel
    variable name does in fact point to a toplevel declaration for a term.
    */
    pub fn as_const(&self) -> TmV {
        match self {
            TopDecl::DefConst(_, tm, _) => tm.clone(),
            _ => panic!("expected const"),
        }
    }

    /** Extract the definition for a toplevel term judgment */
    pub fn as_def(&self) -> (Row<TyS>, TyS, TmS) {
        match self {
            TopDecl::Def(args, ret, body) => (args.clone(), ret.clone(), body.clone()),
            _ => panic!("expected def"),
        }
    }
}

/** Storage for toplevel declarations. */
pub struct Toplevel {
    /// The theory that we are elaborating with respect to
    pub theory: Rc<DiscreteDblTheory>,
    /// The toplevel declarations, indexed by their name.
    pub declarations: HashMap<TopVarName, TopDecl>,
}

impl Toplevel {
    /// Constructor for an empty [Toplevel].
    pub fn new(theory: Rc<DiscreteDblTheory>) -> Self {
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
