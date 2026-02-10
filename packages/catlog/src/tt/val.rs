//! Values for types and terms.
//!
//! See [crate::tt] for what this means.

use bwd::Bwd;
use derive_more::{Constructor, Deref};

use super::{prelude::*, stx::*, theory::*};
use crate::zero::LabelSegment;

/// A way of resolving [BwdIdx] found in [TmS_::Var] to values.
pub type Env = Bwd<TmV>;

/// The content of a record type value.
/// Kind of disturbing that the field types are still syntax...
#[derive(Clone, Constructor)]
pub struct RecordV {
    /// The closed-over environment.
    pub env: Env,
    /// The types for the fields.
    pub fields: Row<TyS>,
    /// Specializations of the fields.
    ///
    /// When we get to actually computing the type of fields, we will look here
    /// to see if they have been specialized.
    pub specializations: Dtry<TyV>,
}

impl RecordV {
    /// Add a specialization a path `path` to type `ty`.
    ///
    /// Precondition: assumes that this produces a subtype.
    pub fn add_specialization(&self, path: &[(FieldName, LabelSegment)], ty: TyV) -> Self {
        Self {
            specializations: merge_specializations(
                &self.specializations,
                &Dtry::singleton(path, ty),
            ),
            ..self.clone()
        }
    }

    /// Merge in the specializations in `specializations`.
    ///
    /// Precondition: assumes that this produces a subtype.
    pub fn specialize(&self, specializations: &Dtry<TyV>) -> Self {
        Self {
            specializations: merge_specializations(&self.specializations, specializations),
            ..self.clone()
        }
    }
}

/// Merge new specializations with old specializations.
pub fn merge_specializations(old: &Dtry<TyV>, new: &Dtry<TyV>) -> Dtry<TyV> {
    let mut result: IndexMap<FieldName, (LabelSegment, DtryEntry<TyV>)> =
        old.entries().map(|(name, e)| (*name, e.clone())).collect();
    for (field, entry) in new.entries() {
        let new_entry = match (old.entry(field), &entry.1) {
            (Option::None, e) => e.clone(),
            (Some(_), DtryEntry::File(subty)) => DtryEntry::File(subty.clone()),
            (Some(DtryEntry::File(ty)), DtryEntry::SubDir(d)) => DtryEntry::File(ty.specialize(d)),
            (Some(DtryEntry::SubDir(d1)), DtryEntry::SubDir(d2)) => {
                DtryEntry::SubDir(merge_specializations(d1, d2))
            }
        };
        result.insert(*field, (entry.0, new_entry));
    }
    result.into()
}

/// Inner enum for [TyV].
pub enum TyV_ {
    /// Type constructor for object types, also see [TyS_::Object].
    Object(ObType),
    /// Type constructor for morphism types, also see [TyS_::Morphism].
    Morphism(MorType, TmV, TmV),
    /// Type constructor for specialized record types.
    ///
    /// This is the target of both [TyS_::Specialize] and [TyS_::Record].
    /// Specifically, [TyS_::Record] evaluates to `TyV_::Record(r)` with
    /// `r.specializations = Dtry::empty()`, and then `TyS_::Specialize(ty, d)` will
    /// add the specializations in `d` to the evaluation of `ty` (which must
    /// evaluate to a value of form `TyV_::Record(_)`).
    Record(RecordV),
    /// Type constructor for singleton types, also see [TyS_::Sing].
    Sing(TyV, TmV),
    /// Type constructor for unit types, also see [TyS_::Unit].
    Unit,
    /// A metavariable, also see [TyS_::Meta].
    Meta(MetaVar),
}

/// Value for total types, dereferences to [TyV_].
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct TyV(Rc<TyV_>);

impl TyV {
    /// Smart constructor for [TyV], [TyV_::Object] case.
    pub fn object(object_type: ObType) -> Self {
        Self(Rc::new(TyV_::Object(object_type)))
    }

    /// Smart constructor for [TyV], [TyV_::Morphism] case.
    pub fn morphism(morphism_type: MorType, dom: TmV, cod: TmV) -> Self {
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

    /// Compute the specialization of `self` by `specializations`.
    ///
    /// Specialization is the process of assigning subtypes to the fields
    /// of a (possibly nested) record.
    ///
    /// There are some subtle points around how multiple specializations
    /// compose that we have to think about.
    ///
    /// Consider the following:
    ///
    /// ```text
    /// type r1 = [ A : Type, B : Type, a : A ]
    /// type r2 = [ x : r1, y : x.B ]
    /// type r3 = r2 & [ .x : r1 & [ .A : (= Int) ] ] & [ .x.B : (= Bool) ]
    /// type r3' = r2 & [ .x : r1 & [ .A : (= Int), .B : (= Bool) ] ]
    /// type r3'' = r2 & [ .x.A : (= Int), .x.B : (= Bool) ]
    /// ```
    ///
    /// r3 and r3' should be represented in the same way, and r3, r3' and r3''
    /// should all be equivalent.
    pub fn specialize(&self, specializations: &Dtry<TyV>) -> Self {
        match &**self {
            TyV_::Record(r) => TyV::record(r.specialize(specializations)),
            _ => panic!("can only specialize a record type"),
        }
    }

    /// Specializes the field at `path` to `ty`.
    ///
    /// Precondition: assumes that this produces a subtype.
    pub fn add_specialization(&self, path: &[(FieldName, LabelSegment)], ty: TyV) -> Self {
        match &**self {
            TyV_::Record(r) => TyV::record(r.add_specialization(path, ty)),
            _ => panic!("can only specialize a record type"),
        }
    }

    /// Smart constructor for [TyV], [TyV_::Unit] case.
    pub fn unit() -> Self {
        Self(Rc::new(TyV_::Unit))
    }

    /// Smart constructor for [TyV], [TyV_::Meta] case.
    pub fn meta(mv: MetaVar) -> Self {
        Self(Rc::new(TyV_::Meta(mv)))
    }
}

/// Inner enum for [TmN].
#[derive(PartialEq, Eq)]
pub enum TmN_ {
    /// Variable.
    Var(FwdIdx, VarName, LabelSegment),
    /// Projection.
    Proj(TmN, FieldName, LabelSegment),
}

/// Neutrals for [terms](TmV), dereferences to [TmN_].
#[derive(Clone, Deref, PartialEq, Eq)]
#[deref(forward)]
pub struct TmN(Rc<TmN_>);

impl TmN {
    /// Smart constructor for [TmN], [TmN_::Var] case.
    pub fn var(fwd_idx: FwdIdx, var_name: VarName, label: LabelSegment) -> Self {
        TmN(Rc::new(TmN_::Var(fwd_idx, var_name, label)))
    }

    /// Smart constructor for [TmN], [TmN_::Proj] case.
    pub fn proj(tm_n: TmN, field_name: FieldName, label: LabelSegment) -> Self {
        TmN(Rc::new(TmN_::Proj(tm_n, field_name, label)))
    }
}

/// Inner enum for [TmV].
pub enum TmV_ {
    /// Neutrals.
    ///
    /// We store the type because we need it for eta-expansion.
    Neu(TmN, TyV),
    /// Application of an object operation in the theory.
    App(VarName, TmV),
    /// Lists of objects.
    /// FIXME: needs lists of morphisms too, or are they all the same?
    /// Syntax says morphisms...
    List(Vec<TmV>),
    /// Records.
    /// What's the difference between Cons and List? Rows are hashmaps?
    Cons(Row<TmV>),
    /// The unique element of the unit type.
    Tt,
    /// An element of a type that is opaque to conversion checking.
    /// Kill, I think.
    Opaque,
    /// The identity morphism of an object.
    Id(TmV),
    /// Composition of morphisms.
    /// Why is this binary?
    Compose(TmV, TmV),
    /// A metavariable.
    Meta(MetaVar),
}

/// Values for terms in the codiscrete mode, dereferences to [TmV_].
///
/// Note that this is *not* the value for a general term. So evaluating a `TmS`
/// to produce a `TmV` and then quoting back will lose information about
/// anything morphism-related. See [crate::tt] for more information.
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct TmV(Rc<TmV_>);

impl TmV {
    /// Smart constructor for [TmV], [TmV_::Neu] case.
    pub fn neu(n: TmN, ty: TyV) -> Self {
        TmV(Rc::new(TmV_::Neu(n, ty)))
    }

    /// Smart constructor for [TmV], [TmV_::App] case.
    pub fn app(name: VarName, x: TmV) -> Self {
        TmV(Rc::new(TmV_::App(name, x)))
    }

    /// Smart constructor for [TmV], [TmV_::List] case.
    pub fn list(elems: Vec<TmV>) -> Self {
        TmV(Rc::new(TmV_::List(elems)))
    }

    /// Smart constructor for [TmV], [TmV_::Cons] case.
    pub fn cons(fields: Row<TmV>) -> Self {
        TmV(Rc::new(TmV_::Cons(fields)))
    }

    /// Smart constructor for [TmV], [TmV_::Tt] case.
    pub fn tt() -> Self {
        TmV(Rc::new(TmV_::Tt))
    }

    /// Smart constructor for [TmV], [TmV_::Opaque] case.
    pub fn opaque() -> Self {
        TmV(Rc::new(TmV_::Opaque))
    }

    /// Smart constructor for [TmV], [TmV_::Id] case.
    pub fn id(x: TmV) -> Self {
        TmV(Rc::new(TmV_::Id(x)))
    }

    /// Smart constructor for [TmV], [TmV_::Compose] case.
    pub fn compose(f: TmV, g: TmV) -> Self {
        TmV(Rc::new(TmV_::Compose(f, g)))
    }

    /// Smart constructor for [TmV], [TmV_::Meta] case.
    pub fn meta(mv: MetaVar) -> Self {
        TmV(Rc::new(TmV_::Meta(mv)))
    }

    /// Unwraps a neutral term, or panics.
    pub fn unwrap_neu(&self) -> TmN {
        match &**self {
            TmV_::Neu(n, _) => n.clone(),
            _ => panic!("expected term to be a neutral"),
        }
    }
}
