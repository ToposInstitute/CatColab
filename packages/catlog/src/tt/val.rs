/*! Values for types and terms.

See [crate::tt] for what this means.
*/

use bwd::Bwd;
use derive_more::Constructor;
use std::ops::Deref;

use crate::tt::{prelude::*, stx::*};

/** A way of resolving [BwdIdx] found in [TmS_::Var] to values */
pub type Env = Bwd<TmV>;

/** The content of a record type value */
#[derive(Clone, Constructor)]
pub struct RecordV {
    /// The base type.
    pub fields0: Row<Ty0>,
    /// The closed-over environment.
    pub env: Env,
    /** The total types for the fields.

    These are ready to be evaluated in `env.snoc(x)` where `x` is a value of
    type `Ty0::Record(fields0)`.
    */
    pub fields1: Row<TyS>,
    /** Specializations of the fields.

    When we get to actually computing the type of fields, we will look here
    to see if they have been specialized.
    */
    pub specializations: Dtry<TyV>,
}

impl RecordV {
    /** Add a specialization a path `path` to type `ty`

    Precondition: assumes that this produces a subtype.
    */
    pub fn add_specialization(&self, path: &[FieldName], ty: TyV) -> Self {
        Self {
            specializations: merge_specializations(
                &self.specializations,
                &Dtry::singleton(path, ty),
            ),
            ..self.clone()
        }
    }

    /** Merge in the specializations in `specializations`

    Precondition: assumes that this produces a subtype.
    */
    pub fn specialize(&self, specializations: &Dtry<TyV>) -> Self {
        Self {
            specializations: merge_specializations(&self.specializations, specializations),
            ..self.clone()
        }
    }
}

/// Merge new specializations with old specializations
pub fn merge_specializations(old: &Dtry<TyV>, new: &Dtry<TyV>) -> Dtry<TyV> {
    let mut result: IndexMap<FieldName, DtryEntry<TyV>> =
        old.entries().map(|(name, e)| (*name, e.clone())).collect();
    for (field, entry) in new.entries() {
        let new_entry = match (old.entry(field), entry) {
            (Option::None, e) => e.clone(),
            (Some(_), DtryEntry::File(subty)) => DtryEntry::File(subty.clone()),
            (Some(DtryEntry::File(ty)), DtryEntry::SubDir(d)) => DtryEntry::File(ty.specialize(d)),
            (Some(DtryEntry::SubDir(d1)), DtryEntry::SubDir(d2)) => {
                DtryEntry::SubDir(merge_specializations(d1, d2))
            }
        };
        result.insert(*field, new_entry);
    }
    result.into()
}

/** Inner enum for [TyV] */
pub enum TyV_ {
    /// Type constructor for object types, also see [TyS_::Object].
    Object(ObjectType),
    /// Type constructor for morphism types, also see [TyS_::Morphism].
    Morphism(MorphismType, TmV, TmV),
    /** Type constructor for specialized record types.

    This is the target of both [TyS_::Specialize] and [TyS_::Record].
    Specifically, [TyS_::Record] evaluates to `TyV_::Record(r)` with
    `r.specializations = Dtry::empty()`, and then `TyS_::Specialize(ty, d)` will
    add the specializations in `d` to the evaluation of `ty` (which must
    evaluate to a value of form `TyV_::Record(_)`).
    */
    Record(RecordV),
    /// Type constructor for singleton types, also see [TyS_::Sing].
    Sing(TyV, TmV),
    /// Type constructor for unit types, also see [TyS_::Unit].
    Unit,
}

/// Value for total types, dereferences to [TyV_].
#[derive(Clone)]
pub struct TyV(Rc<TyV_>);

impl Deref for TyV {
    type Target = TyV_;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl TyV {
    /// Smart constructor for [TyV], [TyV_::Object] case.
    pub fn object(object_type: ObjectType) -> Self {
        Self(Rc::new(TyV_::Object(object_type)))
    }

    /// Smart constructor for [TyV], [TyV_::Morphism] case.
    pub fn morphism(morphism_type: MorphismType, dom: TmV, cod: TmV) -> Self {
        Self(Rc::new(TyV_::Morphism(morphism_type, dom, cod)))
    }

    /// Smart constructor for [TyV], [TyV_::Record] case.
    pub fn record(record_v: RecordV) -> Self {
        Self(Rc::new(TyV_::Record(record_v)))
    }

    /// Smart constructor for [TyV], [TyV_::Sing] case.
    pub fn sing(ty_v: TyV, tm_v: TmV) -> Self {
        Self(Rc::new(TyV_::Sing(ty_v, tm_v)))
    }

    /** Compute the specialization of `self` by `specializations`.

    Specialization is the process of assigning subtypes to the fields
    of a (possibly nested) record.

    There are some subtle points around how multiple specializations
    compose that we have to think about.

    Consider the following:

    ```text
    type r1 = [ A : Type, B : Type, a : A ]
    type r2 = [ x : r1, y : x.B ]
    type r3 = r2 & [ .x : r1 & [ .A : (= Int) ] ] & [ .x.B : (= Bool) ]
    type r3' = r2 & [ .x : r1 & [ .A : (= Int), .B : (= Bool) ] ]
    type r3'' = r2 & [ .x.A : (= Int), .x.B : (= Bool) ]
    ```

    r3 and r3' should be represented in the same way, and r3, r3' and r3''
    should all be equivalent.
    */
    pub fn specialize(&self, specializations: &Dtry<TyV>) -> Self {
        match &**self {
            TyV_::Record(r) => TyV::record(r.specialize(specializations)),
            _ => panic!("can only specialize a record type"),
        }
    }

    /** Specializes the field at `path` to `ty`

    Precondition: assumes that this produces a subtype.
    */
    pub fn add_specialization(&self, path: &[FieldName], ty: TyV) -> Self {
        match &**self {
            TyV_::Record(r) => TyV::record(r.add_specialization(path, ty)),
            _ => panic!("can only specialize a record type"),
        }
    }

    /// Smart constructor for [TyV], [TyV_::Unit] case.
    pub fn unit() -> Self {
        Self(Rc::new(TyV_::Unit))
    }

    /// The base type
    pub fn ty0(&self) -> Ty0 {
        match &**self {
            TyV_::Object(qname) => Ty0::Object(qname.clone()),
            TyV_::Morphism(_, _, _) => Ty0::Unit,
            TyV_::Record(record_v) => Ty0::Record(record_v.fields0.clone()),
            TyV_::Sing(ty_v, _) => ty_v.ty0(),
            TyV_::Unit => Ty0::Unit,
        }
    }
}

/** Inner enum for [TmN]. */
#[derive(PartialEq, Eq)]
pub enum TmN_ {
    /// Variable.
    Var(FwdIdx, VarName),
    /// Projection.
    Proj(TmN, FieldName),
}

/** Neutrals for base terms, dereferences to [TmN_]. */
#[derive(Clone, PartialEq, Eq)]
pub struct TmN(Rc<TmN_>);

impl Deref for TmN {
    type Target = TmN_;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl TmN {
    /// Smart constructor for [TmN], [TmN_::Var] case.
    pub fn var(fwd_idx: FwdIdx, var_name: VarName) -> Self {
        TmN(Rc::new(TmN_::Var(fwd_idx, var_name)))
    }

    /// Smart constructor for [TmN], [TmN_::Proj] case.
    pub fn proj(tm_n: TmN, field_name: FieldName) -> Self {
        TmN(Rc::new(TmN_::Proj(tm_n, field_name)))
    }
}

/** Values for base terms.

Note that this is *not* the value for total terms. So evaluating a `TmS` to
produce a `TmV` and then quoting back will lose information about anything
morphism-related. See [crate::tt] for more information.

It turns out that each of the cases for [TmV] has a single cheaply cloneable
field, so we don't need to bother making a `TmV_`.
*/
#[derive(Clone)]
pub enum TmV {
    /** Neutrals.

    We store the type because we need it for eta-expansion.
    */
    Neu(TmN, TyV),
    /// Records.
    Cons(Row<TmV>),
    /// The unique element of `Ty0::Unit`.
    Tt,
    /// An element of a type that is opaque to conversion checking
    Opaque,
}

impl TmV {
    /// Coerces self to a neutral
    pub fn as_neu(&self) -> TmN {
        match self {
            TmV::Neu(n, _) => n.clone(),
            _ => panic!("expected neutral"),
        }
    }
}
