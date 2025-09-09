use crate::tt::{prelude::*, stx::*, toplevel::*, val::*};

pub struct Evaluator<'a> {
    toplevel: &'a Toplevel,
    env: Env,
    // The next neutral
    scope_length: usize,
}

impl<'a> Evaluator<'a> {
    pub fn eval_record(&self, r: &RecordS) -> RecordV {
        RecordV::new(r.fields0.clone(), self.env.clone(), r.fields1.clone(), Dtry::empty())
    }

    pub fn eval_ty(&self, ty: &TyS) -> TyV {
        match &**ty {
            TyS_::Object(ot) => TyV::object(ot.clone()),
            TyS_::ProArrow(pt, dom, cod) => {
                TyV::pro_arrow(pt.clone(), self.eval_tm(dom), self.eval_tm(cod))
            }
            TyS_::Record(r) => TyV::record(self.eval_record(r)),
            TyS_::Sing(ty_s, tm_s) => TyV::sing(self.eval_ty(ty_s), self.eval_tm(tm_s)),
            TyS_::Specialize(ty_s, specializations) => {
                self.eval_ty(ty_s).specialize(specializations.map(&|ty_s| self.eval_ty(ty_s)))
            }
            TyS_::Unit => TyV::unit(),
        }
    }

    pub fn eval_tm(&self, tm: &TmS) -> TmV {
        match &**tm {
            TmS_::Var(i, _) => self.env.get(**i).cloned().unwrap(),
            TmS_::Cons(fields) => {
                TmV::Cons(fields.iter().map(|(name, tm)| (*name, self.eval_tm(tm))).collect())
            }
            TmS_::Proj(tm, field) => self.proj(&self.eval_tm(tm), *field),
            TmS_::Tt => TmV::Tt,
        }
    }

    pub fn proj(&self, tm: &TmV, field_name: FieldName) -> TmV {
        match tm {
            TmV::Neu(n, ty) => {
                TmV::Neu(TmN::proj(n.clone(), field_name), self.field_ty(ty, tm, field_name))
            }
            TmV::Cons(fields) => fields.get(field_name).cloned().unwrap(),
            _ => panic!(),
        }
    }

    pub fn field_ty(&self, ty: &TyV, val: &TmV, field_name: FieldName) -> TyV {
        match &**ty {
            TyV_::Record(r) => {
                let field_ty_s = r.fields1.get(field_name).cloned().unwrap();
                todo!()
            }
            _ => panic!("tried to get the type of field for non-record type"),
        }
    }
}
