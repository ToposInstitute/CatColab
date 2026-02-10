//! Syntax for types and terms.
//!
//! See [crate::tt] for what this means.

use derive_more::{Constructor, Deref};
use std::fmt;
use std::fmt::Write as _;

use super::{prelude::*, theory::*};
use crate::zero::LabelSegment;

/// A metavariable.
///
/// Metavariables are emitted on elaboration error or when explicitly
/// requested with `@hole`.
///
/// Metavariables in notebook elaboration are namespaced to the notebook.
#[derive(Constructor, Clone, Copy, PartialEq, Eq)]
pub struct MetaVar {
    ref_id: Option<Ustr>,
    id: usize,
}

impl fmt::Display for MetaVar {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "?{}", self.id)
    }
}

/// Content of record type syntax.
#[derive(Clone, Constructor)]
pub struct RecordS {
    /// The total types of the fields.
    pub fields: Row<TyS>,
}

/// Inner enum for [TyS].
pub enum TyS_ {
    /// A reference to a top-level declaration.
    TopVar(TopVarName),
    /// Type constructor for object types.
    ///
    /// Example syntax: `Entity` (top-level constants are bound by the elaborator to
    /// various object types).
    ///
    /// A term of type `Object(ot)` represents an object of object type `ot`.
    Object(ObType),

    /// Type constructor for morphism types.
    ///
    /// Example syntax: `Attr x a` (top-level constants are bound by the elaborator
    /// to constructors for morphism types).
    ///
    /// A term of type `Morphism(mt, dom, cod)` represents an morphism of morphism
    /// type `mt` from `dom` to `cod`.
    Morphism(MorType, TmS, TmS),

    /// Type constructor for record types.
    ///
    /// Example syntax: `[x : A, y : B]`.
    ///
    /// A term `x` of type `Record(r)` represents a record where field `f` has type
    /// `eval(env.snoc(eval(env, x)), r.fields1[f])`.
    Record(RecordS),

    /// Type constructor for singleton types.
    ///
    /// Example syntax: `@sing a` (assuming `a` is a term that synthesizes a type).
    ///
    /// A term `x` of type `Sing(ty, tm)` is a term of `ty` that is convertible with
    /// `tm`.
    Sing(TyS, TmS),

    /// Type constructor for specialized types.
    ///
    /// Example syntax: `A & [ .x : @sing a ]`.
    ///
    /// A term `x` of type `Specialize(ty, d)` is a term of `ty` where additionally
    /// for each path `p` (e.g. `.x`, `.a.b`, etc.) in `d`, `x.p` is of type `d[p]`.
    ///
    /// In order to form this type, it must be the case that `d[p]` is a subtype of
    /// the type of the field at path `p`.
    Specialize(TyS, Vec<(Vec<(FieldName, LabelSegment)>, TyS)>),

    /// Type constructor for the unit type.
    ///
    /// Example syntax: `Unit`.
    ///
    /// All terms of this type are convertible with `tt : Unit`.
    Unit,

    /// A metavar.
    ///
    /// Currently, this is only used for handling elaboration errors, we might
    /// add more unification/holes later.
    Meta(MetaVar),
}

/// Syntax for total types, dereferences to [TyS_].
///
/// See [crate::tt] for an explanation of what total types are, and for an
/// explanation of our approach to Rc pointers in abstract syntax trees.
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct TyS(Rc<TyS_>);

impl TyS {
    /// Smart constructor for [TyS], [TyS_::TopVar] case.
    pub fn topvar(name: TopVarName) -> Self {
        Self(Rc::new(TyS_::TopVar(name)))
    }

    /// Smart constructor for [TyS], [TyS_::Object] case.
    pub fn object(object_type: ObType) -> Self {
        Self(Rc::new(TyS_::Object(object_type)))
    }

    /// Smart constructor for [TyS], [TyS_::Morphism] case.
    pub fn morphism(morphism_type: MorType, dom: TmS, cod: TmS) -> Self {
        Self(Rc::new(TyS_::Morphism(morphism_type, dom, cod)))
    }

    /// Smart constructor for [TyS], [TyS_::Record] case.
    pub fn record(record_s: RecordS) -> Self {
        Self(Rc::new(TyS_::Record(record_s)))
    }

    /// Smart constructor for [TyS], [TyS_::Sing] case.
    pub fn sing(ty: TyS, tm: TmS) -> Self {
        Self(Rc::new(TyS_::Sing(ty, tm)))
    }

    /// Smart constructor for [TyS], [TyS_::Specialize] case.
    pub fn specialize(
        ty: TyS,
        specializations: Vec<(Vec<(FieldName, LabelSegment)>, TyS)>,
    ) -> Self {
        Self(Rc::new(TyS_::Specialize(ty, specializations)))
    }

    /// Smart constructor for [TyS], [TyS_::Unit] case.
    pub fn unit() -> Self {
        Self(Rc::new(TyS_::Unit))
    }

    /// Smart constructor for [TyS], [TyS_::Meta] case.
    pub fn meta(mv: MetaVar) -> Self {
        Self(Rc::new(TyS_::Meta(mv)))
    }
}

impl ToDoc for TyS {
    fn to_doc<'a>(&self) -> D<'a> {
        match &**self {
            TyS_::TopVar(name) => t(format!("{}", name)),
            TyS_::Object(ob_type) => t(format!("{}", ob_type)),
            TyS_::Morphism(mor_type, dom, cod) => {
                mor_type.to_doc().parens() + tuple([dom.to_doc(), cod.to_doc()])
            }
            TyS_::Record(r) => tuple(r.fields.iter().map(|(_, (label, ty))| {
                binop(t(":"), t(format!("{}", label)).group(), ty.to_doc())
            })),
            TyS_::Sing(_, tm) => t("@sing") + s() + tm.to_doc(),
            TyS_::Specialize(ty, d) => binop(
                t("&"),
                ty.to_doc(),
                tuple(
                    d.iter().map(|(name, ty)| binop(t(":"), t(path_to_string(name)), ty.to_doc())),
                ),
            ),
            TyS_::Unit => t("Unit"),
            TyS_::Meta(mv) => t(format!("?{}", mv.id)),
        }
    }
}

fn path_to_string(path: &[(FieldName, LabelSegment)]) -> String {
    let mut out = String::new();
    for (_, seg) in path {
        write!(&mut out, ".{}", seg).unwrap();
    }
    out
}

impl fmt::Display for TyS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}

/// Inner enum for [TmS].
pub enum TmS_ {
    /// A reference to a top-level constant def.
    TopVar(TopVarName),
    /// An application of a top-level term judgment to arguments.
    TopApp(TopVarName, Vec<TmS>),
    /// Variable syntax.
    ///
    /// We use a backward index, as when we evaluate we store the
    /// environment in a [bwd::Bwd], and this indexes into that.
    Var(BwdIdx, VarName, LabelSegment),
    /// Record introduction.
    Cons(Row<TmS>),
    /// Record elimination.
    Proj(TmS, FieldName, LabelSegment),
    /// Unit introduction.
    ///
    /// Note that eta-expansion takes care of elimination for units.
    Tt,
    /// Identity morphism at an object.
    Id(TmS),
    /// Composite of two morphisms.
    Compose(TmS, TmS),
    /// Application of an object operation in the theory.
    ObApp(VarName, TmS),
    /// List of objects or morphisms.
    List(Vec<TmS>),
    /// A metavar.
    ///
    /// This only appears when we have an error in elaboration.
    Meta(MetaVar),
}

/// Syntax for total terms, dereferences to [TmS_].
///
/// See [crate::tt] for an explanation of what total types are, and for an
/// explanation of our approach to Rc pointers in abstract syntax trees.
/// Is this "see" true anymore?
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct TmS(Rc<TmS_>);

impl TmS {
    /// Smart constructor for [TmS], [TmS_::TopVar] case.
    pub fn topvar(var_name: VarName) -> Self {
        Self(Rc::new(TmS_::TopVar(var_name)))
    }

    /// Smart constructor for [TmS], [TmS_::TopApp] case.
    pub fn topapp(var_name: VarName, args: Vec<TmS>) -> Self {
        Self(Rc::new(TmS_::TopApp(var_name, args)))
    }

    /// Smart constructor for [TmS], [TmS_::Var] case.
    pub fn var(bwd_idx: BwdIdx, var_name: VarName, label: LabelSegment) -> Self {
        Self(Rc::new(TmS_::Var(bwd_idx, var_name, label)))
    }

    /// Smart constructor for [TmS], [TmS_::Cons] case.
    pub fn cons(row: Row<TmS>) -> Self {
        Self(Rc::new(TmS_::Cons(row)))
    }

    /// Smart constructor for [TmS], [TmS_::Proj] case.
    pub fn proj(tm_s: TmS, field_name: FieldName, label: LabelSegment) -> Self {
        Self(Rc::new(TmS_::Proj(tm_s, field_name, label)))
    }

    /// Smart constructor for [TmS], [TmS_::Tt] case.
    pub fn tt() -> Self {
        Self(Rc::new(TmS_::Tt))
    }

    /// Smart constructor for [TmS], [TmS_::Id] case.
    pub fn id(ob: TmS) -> Self {
        Self(Rc::new(TmS_::Id(ob)))
    }

    /// Smart constructor for [TmS], [TmS_::Compose] case.
    pub fn compose(f: TmS, g: TmS) -> Self {
        Self(Rc::new(TmS_::Compose(f, g)))
    }

    /// Smart constructor for [TmS], [TmS_::ObApp] case.
    pub fn ob_app(name: VarName, x: TmS) -> Self {
        Self(Rc::new(TmS_::ObApp(name, x)))
    }

    /// Smart constructor for [TmS], [TmS_::List] case.
    pub fn list(elems: Vec<TmS>) -> Self {
        Self(Rc::new(TmS_::List(elems)))
    }

    /// Smart constructor for [TmS], [TmS_::Meta] case.
    pub fn meta(mv: MetaVar) -> Self {
        Self(Rc::new(TmS_::Meta(mv)))
    }
}

impl ToDoc for TmS {
    fn to_doc<'a>(&self) -> D<'a> {
        match &**self {
            TmS_::TopVar(name) => t(format!("{}", name)),
            TmS_::TopApp(name, args) => {
                t(format!("{}", name)) + tuple(args.iter().map(|arg| arg.to_doc()))
            }
            TmS_::Var(_, _, label) => t(format!("{}", label)),
            TmS_::Proj(tm, _, label) => tm.to_doc() + t(format!(".{}", label)),
            TmS_::Cons(fields) => tuple(fields.iter().map(|(_, (label, field))| {
                binop(t(":="), t(format!("{}", label)), field.to_doc())
            })),
            TmS_::Id(ob) => (t("@id") + s() + ob.to_doc()).parens(),
            TmS_::Compose(f, g) => binop(t("·"), f.to_doc(), g.to_doc()),
            TmS_::ObApp(name, x) => unop(t(format!("@{name}")), x.to_doc()),
            TmS_::List(elems) => tuple(elems.iter().map(|elem| elem.to_doc())),
            TmS_::Tt => t("tt"),
            TmS_::Meta(mv) => t(format!("?{}", mv.id)),
        }
    }
}

impl fmt::Display for TmS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}
