use crate::{tt::prelude::*, zero::QualifiedName};
use std::fmt;
use std::ops::Deref;

pub type ObjectType = QualifiedName;
pub type ProArrowType = QualifiedName;

#[derive(Clone)]
pub enum Ty0 {
    Object(ObjectType),
    Record(Row<Ty0>),
    Unit,
}

#[derive(Clone)]
pub struct RecordS {
    pub fields0: Row<Ty0>,
    pub fields1: Tele<TyS>,
}

impl RecordS {
    pub fn new(fields0: Row<Ty0>, fields1: Tele<TyS>) -> Self {
        Self { fields0, fields1 }
    }
}

/// We are doing a 1ml style presentation, so type syntax includes both object
/// types and proarrow types
pub enum TyS_ {
    Object(ObjectType),
    ProArrow(ProArrowType, TmS, TmS),
    Record(RecordS),
    Sing(TyS, TmS),
    Specialize(TyS, Dtry<TyS>),
    Unit,
}

#[derive(Clone)]
pub struct TyS(Rc<TyS_>);

impl Deref for TyS {
    type Target = TyS_;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl TyS {
    pub fn object(object_type: ObjectType) -> Self {
        Self(Rc::new(TyS_::Object(object_type)))
    }

    pub fn pro_arrow(proarrow_type: ProArrowType, dom: TmS, cod: TmS) -> Self {
        Self(Rc::new(TyS_::ProArrow(proarrow_type, dom, cod)))
    }

    pub fn record(record_s: RecordS) -> Self {
        Self(Rc::new(TyS_::Record(record_s)))
    }

    pub fn sing(ty: TyS, tm: TmS) -> Self {
        Self(Rc::new(TyS_::Sing(ty, tm)))
    }

    pub fn specialize(ty: TyS, specializations: Dtry<TyS>) -> Self {
        Self(Rc::new(TyS_::Specialize(ty, specializations)))
    }

    pub fn unit() -> Self {
        Self(Rc::new(TyS_::Unit))
    }
}

impl<'a> fmt::Display for TyS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        todo!()
    }
}

pub enum TmS_ {
    Var(BwdIdx, VarName),
    Cons(Tele<TmS>),
    Proj(TmS, FieldName),
    Tt,
}

#[derive(Clone)]
pub struct TmS(Rc<TmS_>);

impl Deref for TmS {
    type Target = TmS_;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl TmS {
    pub fn var(bwd_idx: BwdIdx, var_name: VarName) -> Self {
        Self(Rc::new(TmS_::Var(bwd_idx, var_name)))
    }

    pub fn cons(tele: Tele<TmS>) -> Self {
        Self(Rc::new(TmS_::Cons(tele)))
    }

    pub fn proj(tm_s: TmS, field_name: FieldName) -> Self {
        Self(Rc::new(TmS_::Proj(tm_s, field_name)))
    }

    pub fn tt() -> Self {
        Self(Rc::new(TmS_::Tt))
    }
}

impl fmt::Display for TmS {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        todo!()
    }
}
