//! Values for types and terms.
//!
//! See [crate::tt] for what this means.

use bwd::Bwd;
use derive_more::Deref;

use super::{prelude::*, stx::*, theory::*};
use crate::zero::{LabelSegment, QualifiedName};

/// A way of resolving [BwdIdx] found in [TmS_::Var] to values.
pub type Env = Bwd<TmV>;

/// The content of a record type value.
#[derive(Clone)]
pub struct RecordV {
    /// The closed-over environment.
    pub env: Env,
    /// The types for the fields.
    pub fields: Rc<Row<BaseTyS>>,
    /// Specializations of the fields.
    ///
    /// When we get to actually computing the type of fields, we will look here
    /// to see if they have been specialized.
    pub specializations: Dtry<BaseTyV>,
}

impl RecordV {
    /// Construct a record type value.
    pub fn new(env: Env, fields: Row<BaseTyS>, specializations: Dtry<BaseTyV>) -> Self {
        Self {
            env,
            fields: Rc::new(fields),
            specializations,
        }
    }

    /// Add a specialization a path `path` to type `ty`.
    ///
    /// Precondition: assumes that this produces a subtype.
    pub fn add_specialization(&self, path: &[(FieldName, LabelSegment)], ty: BaseTyV) -> Self {
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
    pub fn specialize(&self, specializations: &Dtry<BaseTyV>) -> Self {
        Self {
            specializations: merge_specializations(&self.specializations, specializations),
            ..self.clone()
        }
    }
}

/// Merge new specializations with old specializations.
pub fn merge_specializations(old: &Dtry<BaseTyV>, new: &Dtry<BaseTyV>) -> Dtry<BaseTyV> {
    let mut result: IndexMap<_, _> = old.entries().map(|(name, e)| (*name, e.clone())).collect();
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

/// Inner enum for [BaseTyV].
pub enum BaseTyV_ {
    /// Type constructor for object types, also see [BaseTyS_::Object].
    Object(ObType),
    /// Type constructor for morphism types, also see [BaseTyS_::Morphism].
    Morphism(MorType, TmV, TmV),
    /// Type constructor for specialized record types.
    ///
    /// This is the target of both [BaseTyS_::Specialize] and [BaseTyS_::Record].
    /// Specifically, [BaseTyS_::Record] evaluates to `BaseTyV_::Record(r)` with
    /// `r.specializations = Dtry::empty()`, and then `BaseTyS_::Specialize(ty, d)` will
    /// add the specializations in `d` to the evaluation of `ty` (which must
    /// evaluate to a value of form `BaseTyV_::Record(_)`).
    Record(RecordV),
    /// Type constructor for singleton types, also see [BaseTyS_::Sing].
    Sing(BaseTyV, TmV),
    /// Type constructor for identity types, also see [BaseTyS_::Id].
    Id(BaseTyV, TmV, TmV),
    /// A metavariable, also see [BaseTyS_::Meta].
    Meta(MetaVar),
    /// The type of terms in a fiber over an object generator of some
    /// instance's codomain model.
    ///
    /// See [BaseTyS_::Over] for the syntactic counterpart and explanation
    /// of why instance identity is not part of this type.
    Over(Vec<(FieldName, LabelSegment)>),
}

/// Value for total types, dereferences to [BaseTyV_].
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct BaseTyV(Rc<BaseTyV_>);

impl BaseTyV {
    /// Smart constructor for [BaseTyV], [BaseTyV_::Object] case.
    pub fn object(object_type: ObType) -> Self {
        Self(Rc::new(BaseTyV_::Object(object_type)))
    }

    /// Smart constructor for [BaseTyV], [BaseTyV_::Morphism] case.
    pub fn morphism(morphism_type: MorType, dom: TmV, cod: TmV) -> Self {
        Self(Rc::new(BaseTyV_::Morphism(morphism_type, dom, cod)))
    }

    /// Smart constructor for [BaseTyV], [BaseTyV_::Record] case.
    pub fn record(record_v: RecordV) -> Self {
        Self(Rc::new(BaseTyV_::Record(record_v)))
    }

    /// Smart constructor for [BaseTyV], [BaseTyV_::Sing] case.
    pub fn sing(ty_v: BaseTyV, tm_v: TmV) -> Self {
        Self(Rc::new(BaseTyV_::Sing(ty_v, tm_v)))
    }

    /// Smart constructor for [BaseTyV], [BaseTyV_::Id] case.
    pub fn id(ty_v: BaseTyV, tm_v1: TmV, tm_v2: TmV) -> Self {
        Self(Rc::new(BaseTyV_::Id(ty_v, tm_v1, tm_v2)))
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
    pub fn specialize(&self, specializations: &Dtry<BaseTyV>) -> Self {
        match &**self {
            BaseTyV_::Record(r) => BaseTyV::record(r.specialize(specializations)),
            _ => panic!("can only specialize a record type"),
        }
    }

    /// Specializes the field at `path` to `ty`.
    ///
    /// Precondition: assumes that this produces a subtype.
    pub fn add_specialization(&self, path: &[(FieldName, LabelSegment)], ty: BaseTyV) -> Self {
        match &**self {
            BaseTyV_::Record(r) => BaseTyV::record(r.add_specialization(path, ty)),
            _ => panic!("can only specialize a record type"),
        }
    }

    /// The empty record type — the unit type / empty model.
    /// Also used as a throwaway type for
    /// untyped placeholder binders (whose type is discarded).
    pub fn empty_record() -> Self {
        Self(Rc::new(BaseTyV_::Record(RecordV::new(Env::nil(), Row::empty(), Dtry::empty()))))
    }

    /// Smart constructor for [BaseTyV], [BaseTyV_::Meta] case.
    pub fn meta(mv: MetaVar) -> Self {
        Self(Rc::new(BaseTyV_::Meta(mv)))
    }

    /// Smart constructor for [BaseTyV], [BaseTyV_::Over] case.
    pub fn over(path: Vec<(FieldName, LabelSegment)>) -> Self {
        Self(Rc::new(BaseTyV_::Over(path)))
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

    /// Extracts a qualifed name from a series of projections.
    pub fn to_qualified_name(&self) -> QualifiedName {
        let mut segments = Vec::new();
        let mut n = self;
        while let TmN_::Proj(n1, f, _) = &**n {
            n = n1;
            segments.push(*f);
        }
        segments.reverse();
        segments.into()
    }
}

/// Value-level payload of [`TmV_::Instance`]. Parallels
/// [`super::stx::InstanceBodyS`].
#[derive(Default)]
pub struct InstanceBodyV {
    /// Generators introduced by this instance, with their fibers.
    pub generators: IndexMap<FieldName, (LabelSegment, Vec<(FieldName, LabelSegment)>)>,
    /// Equation witnesses, asserted to hold in this instance.
    pub equations: Vec<(TmV, TmV)>,
    /// Sub-instance imports, keyed by import name.
    pub sub_instances: IndexMap<FieldName, (LabelSegment, TmV)>,
}

/// Inner enum for [TmV].
pub enum TmV_ {
    /// Neutrals.
    ///
    /// We store the type because we need it for eta-expansion.
    Neu(TmN, BaseTyV),
    /// Application of an object operation in the theory.
    App(VarName, TmV),
    /// Application of a codomain morphism to an [`Over`-typed](BaseTyV_::Over)
    /// term. See [`TmS_::OverApp`] for the syntactic counterpart and
    /// argument-by-argument documentation.
    OverApp(FieldName, LabelSegment, Vec<(FieldName, LabelSegment)>, TmV),
    /// An instance value of a model (sketch) type. See
    /// [`super::stx::InstanceBodyS`] for the payload description; this
    /// is its value-level counterpart.
    Instance(InstanceBodyV),
    /// Lists of objects.
    List(Vec<TmV>),
    /// Records.
    Cons(Row<TmV>),
    /// The identity morphism of an object.
    Id(TmV),
    /// The tabulation of a morphism.
    Tab(TmV),
    /// Composition of morphisms.
    Compose(TmV, TmV),
    /// A metavariable.
    Meta(MetaVar),
}

/// Values for terms, dereferences to [TmV_].
#[derive(Clone, Deref)]
#[deref(forward)]
pub struct TmV(Rc<TmV_>);

impl TmV {
    /// Smart constructor for [TmV], [TmV_::Neu] case.
    pub fn neu(n: TmN, ty: BaseTyV) -> Self {
        TmV(Rc::new(TmV_::Neu(n, ty)))
    }

    /// Smart constructor for [TmV], [TmV_::App] case.
    pub fn app(name: VarName, x: TmV) -> Self {
        TmV(Rc::new(TmV_::App(name, x)))
    }

    /// Smart constructor for [TmV], [TmV_::OverApp] case.
    pub fn over_app(
        mor: FieldName,
        mor_label: LabelSegment,
        tgt_path: Vec<(FieldName, LabelSegment)>,
        inner: TmV,
    ) -> Self {
        TmV(Rc::new(TmV_::OverApp(mor, mor_label, tgt_path, inner)))
    }

    /// Smart constructor for [TmV], [TmV_::Instance] case.
    pub fn instance(body: InstanceBodyV) -> Self {
        TmV(Rc::new(TmV_::Instance(body)))
    }

    /// Smart constructor for [TmV], [TmV_::List] case.
    pub fn list(elems: Vec<TmV>) -> Self {
        TmV(Rc::new(TmV_::List(elems)))
    }

    /// Smart constructor for [TmV], [TmV_::Cons] case.
    pub fn cons(fields: Row<TmV>) -> Self {
        TmV(Rc::new(TmV_::Cons(fields)))
    }

    /// The empty record value `[]` — the unique element of the empty
    /// record type. Also serves as the (proof-irrelevant) canonical
    /// inhabitant of `Id` types under eta.
    pub fn empty_cons() -> Self {
        TmV(Rc::new(TmV_::Cons(Row::empty())))
    }

    /// Smart constructor for [TmV], [TmV_::Id] case.
    pub fn id(x: TmV) -> Self {
        TmV(Rc::new(TmV_::Id(x)))
    }

    /// Smart constructor for [TmV], [TmV_::Tab] case.
    pub fn tab(mor: TmV) -> Self {
        TmV(Rc::new(TmV_::Tab(mor)))
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
