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

/// Inner enum for [BaseTyS].
pub enum BaseTyS_ {
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
    Record(Row<BaseTyS>),

    /// Type constructor for singleton types.
    ///
    /// Example syntax: `@sing a` (assuming `a` is a term that synthesizes a type).
    ///
    /// A term `x` of type `Sing(ty, tm)` is a term of `ty` that is convertible with
    /// `tm`.
    Sing(BaseTyS, TmS),

    /// Type constructor for identity types.
    ///
    /// Example syntax: `a == b` (assuming `a` and `b` are terms that synthesize the same type).
    ///
    /// A term `p` of type `a == b` is a proof that `a` and `b` are equal.
    Id(BaseTyS, TmS, TmS),

    /// Type constructor for specialized types.
    ///
    /// Example syntax: `A & [ .x : @sing a ]`.
    ///
    /// A term `x` of type `Specialize(ty, d)` is a term of `ty` where additionally
    /// for each path `p` (e.g. `.x`, `.a.b`, etc.) in `d`, `x.p` is of type `d[p]`.
    ///
    /// In order to form this type, it must be the case that `d[p]` is a subtype of
    /// the type of the field at path `p`.
    Specialize(BaseTyS, Vec<(Vec<(FieldName, LabelSegment)>, BaseTyS)>),

    /// A metavar.
    ///
    /// Currently, this is only used for handling elaboration errors, we might
    /// add more unification/holes later.
    Meta(MetaVar),
}

/// Syntax for total types, dereferences to [BaseTyS_].
///
/// See [crate::tt] for an explanation of what total types are, and for an
/// explanation of our approach to Rc pointers in abstract syntax trees.
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct BaseTyS(Rc<BaseTyS_>);

impl BaseTyS {
    /// Smart constructor for [BaseTyS], [BaseTyS_::TopVar] case.
    pub fn topvar(name: TopVarName) -> Self {
        Self(Rc::new(BaseTyS_::TopVar(name)))
    }

    /// Smart constructor for [BaseTyS], [BaseTyS_::Object] case.
    pub fn object(object_type: ObType) -> Self {
        Self(Rc::new(BaseTyS_::Object(object_type)))
    }

    /// Smart constructor for [BaseTyS], [BaseTyS_::Morphism] case.
    pub fn morphism(morphism_type: MorType, dom: TmS, cod: TmS) -> Self {
        Self(Rc::new(BaseTyS_::Morphism(morphism_type, dom, cod)))
    }

    /// Smart constructor for [BaseTyS], [BaseTyS_::Record] case.
    pub fn record(fields: Row<BaseTyS>) -> Self {
        Self(Rc::new(BaseTyS_::Record(fields)))
    }

    /// Smart constructor for [BaseTyS], [BaseTyS_::Sing] case.
    pub fn sing(ty: BaseTyS, tm: TmS) -> Self {
        Self(Rc::new(BaseTyS_::Sing(ty, tm)))
    }

    /// Smart constructor for [BaseTyS], [BaseTyS_::Id] case.
    pub fn id(ty: BaseTyS, tm1: TmS, tm2: TmS) -> Self {
        Self(Rc::new(BaseTyS_::Id(ty, tm1, tm2)))
    }

    /// Smart constructor for [BaseTyS], [BaseTyS_::Specialize] case.
    pub fn specialize(
        ty: BaseTyS,
        specializations: Vec<(Vec<(FieldName, LabelSegment)>, BaseTyS)>,
    ) -> Self {
        Self(Rc::new(BaseTyS_::Specialize(ty, specializations)))
    }

    /// Smart constructor for [BaseTyS], [BaseTyS_::Meta] case.
    pub fn meta(mv: MetaVar) -> Self {
        Self(Rc::new(BaseTyS_::Meta(mv)))
    }
}

impl ToDoc for BaseTyS {
    fn to_doc<'a>(&self) -> D<'a> {
        match &**self {
            BaseTyS_::TopVar(name) => t(format!("{}", name)),
            BaseTyS_::Object(ob_type) => t(format!("{}", ob_type)),
            BaseTyS_::Morphism(mor_type, dom, cod) => {
                mor_type.to_doc().parens() + tuple([dom.to_doc(), cod.to_doc()])
            }
            BaseTyS_::Record(fields) => tuple(fields.iter().map(|(_, (label, ty))| {
                binop(t(":"), t(format!("{}", label)).group(), ty.to_doc())
            })),
            BaseTyS_::Sing(_, tm) => t("@sing") + s() + tm.to_doc(),
            BaseTyS_::Id(_, tm1, tm2) => binop(t("=="), tm1.to_doc(), tm2.to_doc()),
            BaseTyS_::Specialize(ty, d) => binop(
                t("&"),
                ty.to_doc(),
                tuple(
                    d.iter().map(|(name, ty)| binop(t(":"), t(path_to_string(name)), ty.to_doc())),
                ),
            ),
            BaseTyS_::Meta(mv) => t(format!("?{}", mv.id)),
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

/// Render an object path as a dotted label string with no leading dot
/// (e.g. `V`, or `we.E` for a nested path), for use inside `Over(...)`.
fn object_path_to_string(path: &[(FieldName, LabelSegment)]) -> String {
    path.iter().map(|(_, seg)| seg.to_string()).collect::<Vec<_>>().join(".")
}

impl fmt::Display for BaseTyS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}

/// Inner enum for [TmS].
pub enum TmS_ {
    /// An application of a top-level term judgment to arguments.
    ///
    /// A closed term (a nullary `def`, e.g. `tt : Unit`) is the empty-argument
    /// case `TopApp(name, [])`.
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
    /// Identity morphism at an object.
    Id(TmS),
    /// Tabulation of a morphism.
    Tab(TmS),
    /// Composite of two morphisms.
    Compose(TmS, TmS),
    /// Application of an object operation in the theory.
    ObApp(VarName, TmS),
    /// List of objects.
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
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct TmS(Rc<TmS_>);

impl TmS {
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

    /// Smart constructor for [TmS], [TmS_::Id] case.
    pub fn id(ob: TmS) -> Self {
        Self(Rc::new(TmS_::Id(ob)))
    }

    /// Smart constructor for [TmS], [TmS_::Tab] case.
    pub fn tab(mor: TmS) -> Self {
        Self(Rc::new(TmS_::Tab(mor)))
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
            TmS_::TopApp(name, args) if args.is_empty() => t(format!("{}", name)),
            TmS_::TopApp(name, args) => {
                t(format!("{}", name)) + tuple(args.iter().map(|arg| arg.to_doc()))
            }
            TmS_::Var(_, _, label) => t(format!("{}", label)),
            TmS_::Proj(tm, _, label) => tm.to_doc() + t(format!(".{}", label)),
            TmS_::Cons(fields) => tuple(fields.iter().map(|(_, (label, field))| {
                binop(t(":="), t(format!("{}", label)), field.to_doc())
            })),
            TmS_::Id(ob) => (t("@id") + s() + ob.to_doc()).parens(),
            TmS_::Tab(mor) => (t("@tab") + s() + mor.to_doc()).parens(),
            TmS_::Compose(f, g) => binop(t("·"), f.to_doc(), g.to_doc()),
            TmS_::ObApp(name, x) => unop(t(format!("@{name}")), x.to_doc()),
            TmS_::List(elems) => tuple(elems.iter().map(|elem| elem.to_doc())),
            TmS_::Meta(mv) => t(format!("?{}", mv.id)),
        }
    }
}

impl fmt::Display for TmS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}

/// Inner enum for [FiberTyS].
///
/// Fiber types type the fiber world — instances of a model and their
/// elements — mirroring how [`BaseTyS`] types the base world (models).
/// See [`crate::tt::toplevel`] for the comprehension-category picture.
/// The three constructors parallel the base world: [`Over`](Self::Over)
/// is the atomic fiber-element type, [`Record`](Self::Record) assembles
/// them into an instance, and [`Id`](Self::Id) imposes a (propositional)
/// equation, just as [`BaseTyS_::Id`] does in the base.
pub enum FiberTyS_ {
    /// The type of a fiber element lying over the object generator of the
    /// codomain model identified by `path`. No surface syntax — its
    /// inhabitants ([`FiberTmS`]) are introduced by set-literal clauses
    /// `field := [...]`, by projection out of a sub-instance import, and
    /// by codomain-morphism application inside an instance body.
    Over(Vec<(FieldName, LabelSegment)>),
    /// An instance of a model — an object of the fiber over the codomain
    /// model — presented as a record of fiber types. A generator is an
    /// [`Over`](Self::Over) field, a sub-instance import is a nested
    /// [`Record`](Self::Record) field, and an equation is an
    /// [`Id`](Self::Id) field. This is what `instance I : X := [...]`
    /// elaborates to, and also the type of a sub-instance import `we :
    /// Edge` (whose generators are then projected as `we.e`).
    Record(Row<FiberTyS>),
    /// A propositional equation between two fiber elements of the given
    /// fiber type, asserted to hold in the enclosing instance. Mirrors
    /// [`BaseTyS_::Id`]; like it, these are proof-irrelevant.
    Id(FiberTyS, FiberTmS, FiberTmS),
}

/// Syntax for fiber types, dereferences to [FiberTyS_].
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct FiberTyS(Rc<FiberTyS_>);

impl FiberTyS {
    /// Smart constructor for [FiberTyS], [FiberTyS_::Over] case.
    pub fn over(path: Vec<(FieldName, LabelSegment)>) -> Self {
        Self(Rc::new(FiberTyS_::Over(path)))
    }

    /// Smart constructor for [FiberTyS], [FiberTyS_::Record] case.
    pub fn record(fields: Row<FiberTyS>) -> Self {
        Self(Rc::new(FiberTyS_::Record(fields)))
    }

    /// Smart constructor for [FiberTyS], [FiberTyS_::Id] case.
    pub fn id(ty: FiberTyS, tm1: FiberTmS, tm2: FiberTmS) -> Self {
        Self(Rc::new(FiberTyS_::Id(ty, tm1, tm2)))
    }
}

impl ToDoc for FiberTyS {
    fn to_doc<'a>(&self) -> D<'a> {
        match &**self {
            FiberTyS_::Over(path) => t(format!("Over({})", object_path_to_string(path))),
            FiberTyS_::Record(fields) => tuple(fields.iter().map(|(_, (label, ty))| {
                binop(t(":"), t(format!("{}", label)).group(), ty.to_doc())
            })),
            FiberTyS_::Id(_, tm1, tm2) => binop(t("=="), tm1.to_doc(), tm2.to_doc()),
        }
    }
}

impl fmt::Display for FiberTyS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}

/// Inner enum for [FiberTmS]: a term of a fiber type, i.e. an element of
/// an instance.
///
/// Fiber terms reference the elaborator's *fiber* scope (generators and
/// sub-instance imports), which is separate from the base context; see
/// [`crate::tt::context::Context`]. They are all neutral — there is no
/// fiber introduction form yet (mapping out of an instance by a record
/// literal is future work), so a fiber term is always a variable, a
/// projection, or a codomain-morphism application.
pub enum FiberTmS_ {
    /// A fiber-context variable: a generator or a sub-instance import.
    /// Backward index into the fiber environment.
    Var(BwdIdx, VarName, LabelSegment),
    /// Projection of a generator out of a sub-instance import, e.g.
    /// `we.e`.
    Proj(FiberTmS, FieldName, LabelSegment),
    /// Application of a codomain morphism to a fiber element. Arguments,
    /// in order: the morphism name (e.g. `src`), its display label, the
    /// codomain object-path it lands at (stored so the result fiber type
    /// is recoverable without consulting the codomain), and the
    /// fiber-typed argument (e.g. the elaboration of `we.e`).
    ///
    /// Example: in `src(we.e) := v1`, the LHS elaborates to
    /// `OverApp(src, src, [(V, V)], Proj(Var(we), e, e))` of fiber type
    /// `Over(.V)`.
    OverApp(FieldName, LabelSegment, Vec<(FieldName, LabelSegment)>, FiberTmS),
    /// A metavar (elaboration-error placeholder).
    Meta(MetaVar),
}

/// Syntax for fiber terms, dereferences to [FiberTmS_].
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct FiberTmS(Rc<FiberTmS_>);

impl FiberTmS {
    /// Smart constructor for [FiberTmS], [FiberTmS_::Var] case.
    pub fn var(bwd_idx: BwdIdx, var_name: VarName, label: LabelSegment) -> Self {
        Self(Rc::new(FiberTmS_::Var(bwd_idx, var_name, label)))
    }

    /// Smart constructor for [FiberTmS], [FiberTmS_::Proj] case.
    pub fn proj(tm: FiberTmS, field_name: FieldName, label: LabelSegment) -> Self {
        Self(Rc::new(FiberTmS_::Proj(tm, field_name, label)))
    }

    /// Smart constructor for [FiberTmS], [FiberTmS_::OverApp] case.
    pub fn over_app(
        mor: FieldName,
        mor_label: LabelSegment,
        tgt_path: Vec<(FieldName, LabelSegment)>,
        inner: FiberTmS,
    ) -> Self {
        Self(Rc::new(FiberTmS_::OverApp(mor, mor_label, tgt_path, inner)))
    }

    /// Smart constructor for [FiberTmS], [FiberTmS_::Meta] case.
    pub fn meta(mv: MetaVar) -> Self {
        Self(Rc::new(FiberTmS_::Meta(mv)))
    }
}

impl ToDoc for FiberTmS {
    fn to_doc<'a>(&self) -> D<'a> {
        match &**self {
            FiberTmS_::Var(_, _, label) => t(format!("{}", label)),
            FiberTmS_::Proj(tm, _, label) => tm.to_doc() + t(format!(".{}", label)),
            FiberTmS_::OverApp(_, mor_label, _, inner) => {
                inner.to_doc() + t(format!(".{mor_label}"))
            }
            FiberTmS_::Meta(mv) => t(format!("?{}", mv.id)),
        }
    }
}

impl fmt::Display for FiberTmS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}
