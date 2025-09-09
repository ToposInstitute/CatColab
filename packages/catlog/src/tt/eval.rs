/*! Evaluation, quoting, and conversion checking

At a high level, this module implements three operations:

- `eval : syntax -> value` ([Evaluator::eval_tm], [Evaluator::eval_ty])
- `quote : value -> syntax` (todo)
- `convertable? : value -> value -> bool` (todo)
*/
use crate::tt::{prelude::*, stx::*, toplevel::*, val::*};

/** The context used in evaluation, quoting, and conversion checking

We bundle this all together because conversion checking and quoting
sometimes need to evaluate terms. For instance, quoting a lambda
involves evaluating the body of the lambda in the context of a freshly
introduced variable; even though we don't have lambdas, a similar
thing applies to dependent records.
*/
#[derive(Clone)]
pub struct Evaluator<'a> {
    toplevel: &'a Toplevel,
    env: Env,
    // The next neutral
    scope_length: usize,
}

impl<'a> Evaluator<'a> {
    fn eval_record(&self, r: &RecordS) -> RecordV {
        RecordV::new(r.fields0.clone(), self.env.clone(), r.fields1.clone(), Dtry::empty())
    }

    /// Return a new [Evaluator] with environment `env`
    pub fn with_env(&self, env: Env) -> Self {
        Self {
            env,
            ..self.clone()
        }
    }

    /** Evaluate type syntax to produce a type value

    Assumes that the type syntax is well-formed and well-scoped with respect
    to self.env
    */
    pub fn eval_ty(&self, ty: &TyS) -> TyV {
        match &**ty {
            TyS_::Object(ot) => TyV::object(ot.clone()),
            TyS_::Morphism(pt, dom, cod) => {
                TyV::morphism(pt.clone(), self.eval_tm(dom), self.eval_tm(cod))
            }
            TyS_::Record(r) => TyV::record(self.eval_record(r)),
            TyS_::Sing(ty_s, tm_s) => TyV::sing(self.eval_ty(ty_s), self.eval_tm(tm_s)),
            TyS_::Specialize(ty_s, specializations) => {
                self.eval_ty(ty_s).specialize(&specializations.map(&|ty_s| self.eval_ty(ty_s)))
            }
            TyS_::Unit => TyV::unit(),
        }
    }

    /** Evaluate term syntax to produce a term value

    Assumes that the term syntax is well-formed and well-scoped with respect
    to self.env
    */
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

    /// Compute the projection of a field from a term value
    pub fn proj(&self, tm: &TmV, field_name: FieldName) -> TmV {
        match tm {
            TmV::Neu(n, ty) => {
                TmV::Neu(TmN::proj(n.clone(), field_name), self.field_ty(ty, tm, field_name))
            }
            TmV::Cons(fields) => fields.get(field_name).cloned().unwrap(),
            _ => panic!(),
        }
    }

    /// Evaluate the type of the field `field_name` of `val : ty`.
    pub fn field_ty(&self, ty: &TyV, val: &TmV, field_name: FieldName) -> TyV {
        match &**ty {
            TyV_::Record(r) => {
                let field_ty_s = r.fields1.get(field_name).unwrap();
                let orig_field_ty = self.with_env(r.env.snoc(val.clone())).eval_ty(field_ty_s);
                match r.specializations.entry(&field_name) {
                    Some(DtryEntry::File(ty)) => ty.clone(),
                    Some(DtryEntry::SubDir(d)) => orig_field_ty.specialize(d),
                    Option::None => orig_field_ty,
                }
            }
            _ => panic!("tried to get the type of field for non-record type"),
        }
    }
}
