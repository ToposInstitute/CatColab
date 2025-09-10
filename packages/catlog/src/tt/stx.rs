/*! Syntax for types and terms.

See [crate::tt] for what this means.
*/

#[cfg(doc)]
use crate::dbl::discrete::theory::DiscreteDblTheory;
use crate::{tt::prelude::*, zero::QualifiedName};
use std::fmt;
use std::ops::Deref;

/// Object types are just qualified names, see [DiscreteDblTheory].
pub type ObjectType = QualifiedName;
/// Morphism types are paths of qualified names, see [DiscreteDblTheory].
#[derive(Clone, PartialEq, Eq)]
pub struct MorphismType(Path<QualifiedName, QualifiedName>);

impl fmt::Display for MorphismType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.0 {
            Path::Id(ot) => write!(f, "Id {ot}"),
            Path::Seq(non_empty) => {
                for (i, segment) in non_empty.iter().enumerate() {
                    if i > 0 {
                        write!(f, " · ")?;
                    }
                    write!(f, "{segment}")?;
                }
                Ok(())
            }
        }
    }
}

/** Type in the base type theory.

See [crate::tt] for more information about what this means. Note that this
is a simple type, so we don't need syntax and value variants.
*/
#[derive(Clone)]
pub enum Ty0 {
    /// The type of (objects of a given object type).
    Object(ObjectType),
    /// Non-dependent record type.
    Record(Row<Ty0>),
    /// Unit type.
    Unit,
}

/** Context of record type syntax. */
#[derive(Clone)]
pub struct RecordS {
    /// The base types of the fields.
    pub fields0: Row<Ty0>,
    /**  The total types of the fields.

    Each of these types is meant to be evaluated in an environment
    where the last element is a value of type `fields0`.
    */
    pub fields1: Row<TyS>,
}

impl RecordS {
    /// Constructor for [RecordS].
    pub fn new(fields0: Row<Ty0>, fields1: Row<TyS>) -> Self {
        Self { fields0, fields1 }
    }
}

/** Inner enum for [TyS]. */
pub enum TyS_ {
    /** Type constructor for object types.

    Example syntax: `Entity` (top-level constants are bound by the elaborator to
    various object types).

    A term of type `Object(ot)` represents an object of object type `ot`.

    The base type for `Object(ot)` is `Ty0::Object(ot)`.
    */
    Object(ObjectType),

    /** Type constructor for morphism types.

    Example syntax: `Attr x a` (top-level constants are bound by the elaborator
    to constructors for morphism types).

    A term of type `Morphism(mt, dom, cod)` represents an morphism of morphism
    type `mt` from `dom` to `cod`.

    The base type for `Morphism(mt, dom, cod)` is Ty0::Unit.
    */
    Morphism(MorphismType, TmS, TmS),

    /** Type constructor for record types.

    Example syntax: `[x : A, y : B]`.

    A term `x` of type `Record(r)` represents a record where field `f` has type
    `eval(env.snoc(eval(env, x)), r.fields1[f])`.

    The base type for `Record(r)` is `Ty0::Record(r.fields0)`.
    */
    Record(RecordS),

    /** Type constructor for singleton types.

    Example syntax: `@sing a` (assuming `a` is a term that synthesizes a type).

    A term `x` of type `Sing(ty, tm)` is a term of `ty` that is convertable with
    `tm`.
    */
    Sing(TyS, TmS),

    /** Type constructor for specialized types.

    Example syntax: `A & [ .x : @sing a ]`.

    A term `x` of type `Specialize(ty, d)` is a term of `ty` where additionally
    for each path `p` (e.g. `.x`, `.a.b`, etc.) in `d`, `x.p` is of type `d[p]`.

    In order to form this type, it must be the case that `d[p]` is a subtype of
    the type of the field at path `p`.
    */
    Specialize(TyS, Dtry<TyS>),

    /** Type constructor for the unit type.

    Example syntax: `Unit`.

    All terms of this type are convertable with `tt : Unit`.
    */
    Unit,
}

/** Syntax for total types, dereferences to [TyS_].

See [crate::tt] for an explanation of what total types are, and for an
explanation of our approach to Rc pointers in abstract syntax trees.
*/
#[derive(Clone)]
pub struct TyS(Rc<TyS_>);

impl Deref for TyS {
    type Target = TyS_;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl TyS {
    /// Smart constructor for [TyS], [TyS_::Object] case.
    pub fn object(object_type: ObjectType) -> Self {
        Self(Rc::new(TyS_::Object(object_type)))
    }

    /// Smart constructor for [TyS], [TyS_::Morphism] case.
    pub fn morphism(morphism_type: MorphismType, dom: TmS, cod: TmS) -> Self {
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
    pub fn specialize(ty: TyS, specializations: Dtry<TyS>) -> Self {
        Self(Rc::new(TyS_::Specialize(ty, specializations)))
    }

    /// Smart constructor for [TyS], [TyS_::Unit] case.
    pub fn unit() -> Self {
        Self(Rc::new(TyS_::Unit))
    }

    fn to_doc<'a>(&self) -> D<'a> {
        match &**self {
            TyS_::Object(object_type) => t(format!("{}", object_type)),
            TyS_::Morphism(morphism_type, dom, cod) => {
                // TODO: how should morphism types be printed out?
                (t(format!("{}", morphism_type)) + s() + dom.to_doc() + s() + cod.to_doc()).parens()
            }
            TyS_::Record(r) => tuple(
                r.fields1
                    .iter()
                    .map(|(name, ty)| binop(":", t(format!("{}", name)), ty.to_doc())),
            ),
            TyS_::Sing(_, tm) => (t("@sing") + s() + tm.to_doc()),
            TyS_::Specialize(ty, d) => binop(
                "&",
                ty.to_doc(),
                tuple(
                    d.flatten()
                        .into_iter()
                        .map(|(name, ty)| binop(":", t(format!(".{}", name)), ty.to_doc())),
                ),
            ),
            TyS_::Unit => t("Unit"),
        }
    }
}

impl fmt::Display for TyS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().pretty())
    }
}

/** Inner enum for [TmS]. */
pub enum TmS_ {
    /** Variable syntax.

    We use a backward index, as when we evaluate we store the
    environment in a [bwd::Bwd], and this indexes into that.
    */
    Var(BwdIdx, VarName),
    /** Record introduction. */
    Cons(Row<TmS>),
    /** Record elimination. */
    Proj(TmS, FieldName),
    /** Unit introduction.

    Note that eta-expansion takes care of elimination for units
    */
    Tt,
}

/** Syntax for total terms, dereferences to [TmS_].

See [crate::tt] for an explanation of what total types are, and for an
explanation of our approach to Rc pointers in abstract syntax trees.
*/
#[derive(Clone)]
pub struct TmS(Rc<TmS_>);

impl Deref for TmS {
    type Target = TmS_;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl TmS {
    /// Smart constructor for [TmS], [TmS_::Var] case.
    pub fn var(bwd_idx: BwdIdx, var_name: VarName) -> Self {
        Self(Rc::new(TmS_::Var(bwd_idx, var_name)))
    }

    /// Smart constructor for [TmS], [TmS_::Cons] case.
    pub fn cons(row: Row<TmS>) -> Self {
        Self(Rc::new(TmS_::Cons(row)))
    }

    /// Smart constructor for [TmS], [TmS_::Proj] case.
    pub fn proj(tm_s: TmS, field_name: FieldName) -> Self {
        Self(Rc::new(TmS_::Proj(tm_s, field_name)))
    }

    /// Smart constructor for [TmS], [TmS_::Tt] case.
    pub fn tt() -> Self {
        Self(Rc::new(TmS_::Tt))
    }

    fn to_doc<'a>(&self) -> D<'a> {
        match &**self {
            TmS_::Var(_, name) => t(format!("{}", name)),
            TmS_::Proj(tm, field) => tm.to_doc() + t(format!(".{}", field)),
            TmS_::Cons(fields) => tuple(
                fields
                    .iter()
                    .map(|(name, field)| binop(":=", t(format!("{}", name)), field.to_doc())),
            ),
            TmS_::Tt => t("tt"),
        }
    }
}

impl fmt::Display for TmS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().pretty())
    }
}
