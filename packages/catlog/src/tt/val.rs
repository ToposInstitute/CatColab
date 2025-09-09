use bwd::Bwd;
use std::ops::Deref;

use crate::tt::{prelude::*, stx::*};

pub type Env = Bwd<TmV>;

#[derive(Clone)]
pub struct RecordV {
    pub fields0: Row<Ty0>,
    pub env: Env,
    pub fields1: Tele<TyS>,
    pub specializations: Dtry<TyV>,
}

impl RecordV {
    pub fn new(
        fields0: Row<Ty0>,
        env: Env,
        fields1: Tele<TyS>,
        specializations: Dtry<TyV>,
    ) -> Self {
        Self {
            fields0,
            env,
            fields1,
            specializations,
        }
    }

    pub fn specialize(&self, specializations: Dtry<TyV>) -> Self {
        Self {
            specializations: self.specializations.merge(specializations),
            ..self.clone()
        }
    }
}

pub enum TyV_ {
    Object(ObjectType),
    ProArrow(ProArrowType, TmV, TmV),
    Record(RecordV),
    Sing(TyV, TmV),
    Unit,
}

#[derive(Clone)]
pub struct TyV(Rc<TyV_>);

impl Deref for TyV {
    type Target = TyV_;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl TyV {
    pub fn object(object_type: ObjectType) -> Self {
        Self(Rc::new(TyV_::Object(object_type)))
    }

    pub fn pro_arrow(proarrow_type: ProArrowType, dom: TmV, cod: TmV) -> Self {
        Self(Rc::new(TyV_::ProArrow(proarrow_type, dom, cod)))
    }

    pub fn record(record_v: RecordV) -> Self {
        Self(Rc::new(TyV_::Record(record_v)))
    }

    pub fn sing(ty_v: TyV, tm_v: TmV) -> Self {
        Self(Rc::new(TyV_::Sing(ty_v, tm_v)))
    }

    // Specialization is the process of assigning subtypes to the fields
    // of a (possibly nested) record.
    //
    // There are some subtle points around how multiple specializations
    // compose that we have to think about.
    //
    // Consider the following:
    //
    // ```
    // type r1 = [ A : Type, B : Type, a : A ]
    // type r2 = [ x : r1, y : x.B ]
    // type r3 = r2 & [ .x : r1 & [ .A : (= Int) ] ] & [ .x.B : (= Bool) ]
    // type r3' = r2 & [ .x : r1 & [ .A : (= Int), .B : (= Bool) ] ]
    // type r3'' = r2 & [ .x.A : (= Int), .x.B : (= Bool) ]
    // ```
    //
    // r3 and r3' should be represented in the same way, and r3, r3' and r3''
    // should all be equivalent.
    pub fn specialize(&self, specializations: Dtry<TyV>) -> Self {
        match &**self {
            TyV_::Record(r) => TyV::record(r.specialize(specializations)),
            _ => panic!("can only specialize a record type"),
        }
    }

    pub fn unit() -> Self {
        Self(Rc::new(TyV_::Unit))
    }
}

pub enum TmN_ {
    Var(VarName, FwdIdx),
    Proj(TmN, FieldName),
}

#[derive(Clone)]
pub struct TmN(Rc<TmN_>);

impl Deref for TmN {
    type Target = TmN_;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl TmN {
    pub fn var(var_name: VarName, fwd_idx: FwdIdx) -> Self {
        TmN(Rc::new(TmN_::Var(var_name, fwd_idx)))
    }

    pub fn proj(tm_n: TmN, field_name: FieldName) -> Self {
        TmN(Rc::new(TmN_::Proj(tm_n, field_name)))
    }
}

#[derive(Clone)]
pub enum TmV {
    Neu(TmN, TyV),
    Cons(Row<TmV>),
    Tt,
}
