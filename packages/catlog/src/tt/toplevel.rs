//! Data structures for managing toplevel declarations in the type theory.
//!
//! Specifically, notebooks will produce [TopDecl::Type] declarations.

use std::fmt;

use crate::{
    dbl::theory::DiscreteDblTheory,
    stdlib::{th_category, th_schema, th_signed_category},
    tt::{prelude::*, stx::*, val::*},
    zero::{QualifiedName, name},
};

/// A theory supported by doublett.
///
/// Equality of these theories is nominal; two theories are the same if and only
/// if they have the same name.
///
/// When we add features to doublett, this will become an enum; doublett will
/// never be parametric (e.g., we will not thread a "theory" type through a bunch
/// of structs in doublett).
#[derive(Clone)]
pub struct Theory {
    /// The name of the theory.
    pub name: QualifiedName,
    /// The definition of the theory.
    pub definition: Rc<DiscreteDblTheory>,
}

impl Theory {
    /// Default constructor for [Theory].
    pub fn new(name: QualifiedName, definition: Rc<DiscreteDblTheory>) -> Self {
        Self { name, definition }
    }
}

impl PartialEq for Theory {
    fn eq(&self, other: &Self) -> bool {
        self.name == other.name
    }
}

impl Eq for Theory {}

impl fmt::Display for Theory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name)
    }
}

/// A toplevel declaration.
#[derive(Clone)]
pub enum TopDecl {
    /// See [Type]
    Type(Type),
    /// See [DefConst]
    DefConst(DefConst),
    /// See [Def]
    Def(Def),
}

/// A toplevel declaration of a type.
///
/// Also stores the evaluation of that type. Because this is an evaluation in
/// the empty context, this is OK to use in any other context as well.
#[derive(Clone)]
pub struct Type {
    /// The theory for the type
    pub theory: Theory,
    /// The syntax of the type (unnormalized)
    pub stx: TyS,
    /// The value of the type (normalized)
    pub val: TyV,
}

impl Type {
    /// Default constructor for [Type]
    pub fn new(theory: Theory, stx: TyS, val: TyV) -> Self {
        Self { theory, stx, val }
    }
}

/// A toplevel declaration of a term in the empty context.
///
/// Also stores the evaluation of that term, and the evaluation of the corresponding type of that term. Because this is an evaluation in the
/// empty context, this is OK to use in any other context as well.
#[derive(Clone)]
pub struct DefConst {
    /// The theory that the constant is defined in
    pub theory: Theory,
    /// The syntax of the constant (unnormalized)
    pub stx: TmS,
    /// The value of the constant (normalized)
    pub val: TmV,
    /// The type of the constant
    pub ty: TyV,
}

impl DefConst {
    /// Default constructor for [DefConst]
    pub fn new(theory: Theory, stx: TmS, val: TmV, ty: TyV) -> Self {
        Self {
            theory,
            stx,
            val,
            ty,
        }
    }
}

/// A toplevel declaration of a term judgment
#[derive(Clone)]
pub struct Def {
    /// The theory that the definition is defined in
    pub theory: Theory,
    /// The arguments for the definition
    pub args: Row<TyS>,
    /// The return type of the definition (to be evaluated in an environment
    /// with values for the arguments)
    pub ret_ty: TyS,
    /// The body of the definition (to be evaluated in an environment with
    /// values for the arguments)
    pub body: TmS,
}

impl Def {
    /// Default constructor for [Def]
    pub fn new(theory: Theory, args: Row<TyS>, ret_ty: TyS, body: TmS) -> Self {
        Self {
            theory,
            args,
            ret_ty,
            body,
        }
    }
}

impl TopDecl {
    /// Extract the type for a toplevel-declaration of a type.
    ///
    /// This should only be used after type checking, when we know that a toplevel
    /// variable name does in fact point to a toplevel declaration for a type.
    pub fn as_ty(&self) -> Type {
        match self {
            TopDecl::Type(ty) => ty.clone(),
            _ => panic!("expected type"),
        }
    }

    /// Extract the term for a toplevel declaration of a term.
    ///
    /// This should only be used after type checking, when we know that a toplevel
    /// variable name does in fact point to a toplevel declaration for a term.
    pub fn as_const(&self) -> DefConst {
        match self {
            TopDecl::DefConst(d) => d.clone(),
            _ => panic!("expected const"),
        }
    }

    /// Extract the definition for a toplevel term judgment
    pub fn as_def(&self) -> Def {
        match self {
            TopDecl::Def(d) => d.clone(),
            _ => panic!("expected def"),
        }
    }
}

/// Construct a library of standard theories
pub fn std_theories() -> HashMap<QualifiedName, Theory> {
    [
        (name("ThSchema"), th_schema()),
        (name("ThCategory"), th_category()),
        (name("ThSignedCategory"), th_signed_category()),
    ]
    .into_iter()
    .map(|(name, def)| (name.clone(), Theory::new(name.clone(), Rc::new(def))))
    .collect()
}

/// Storage for toplevel declarations.
pub struct Toplevel {
    /// Library of theories, indexed by name
    pub theory_library: HashMap<QualifiedName, Theory>,
    /// The toplevel declarations, indexed by their name.
    pub declarations: HashMap<TopVarName, TopDecl>,
}

impl Toplevel {
    /// Constructor for an empty [Toplevel].
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
