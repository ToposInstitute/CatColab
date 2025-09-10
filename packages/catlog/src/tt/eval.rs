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

    fn bind_neu(&self, name: VarName, ty: TyV) -> Self {
        let v = TmV::Neu(TmN::var(self.scope_length.into(), name), ty);
        Self {
            env: self.env.snoc(v),
            scope_length: self.scope_length + 1,
            ..self.clone()
        }
    }

    /** Produce type syntax from a type value.

    This is a *section* of eval, in that `self.eval_ty(self.quote_ty(ty_v)) == ty_v`
    but it is not necessarily true that `self.quote_ty(self.eval_ty(ty_s)) == ty_v`.

    This is used for displaying `TyV` to the user in type errors. In theory this
    could be used for conversion checking, but it's more efficient to implement that
    directly, and it's better to *not* do eta-expansion for user-facing messages.
    */
    pub fn quote_ty(&self, ty: &TyV) -> TyS {
        match &**ty {
            TyV_::Object(object_type) => TyS::object(object_type.clone()),
            TyV_::Morphism(morphism_type, dom, cod) => {
                TyS::morphism(morphism_type.clone(), self.quote_tm(dom), self.quote_tm(cod))
            }
            TyV_::Record(r) => {
                let self_varname = NameSegment::Text(ustr("self"));
                let r_eval = self.with_env(r.env.clone()).bind_neu(self_varname, ty.clone());
                let fields1 = r
                    .fields1
                    .iter()
                    .map(|(name, ty_s)| {
                        (
                            *name,
                            self.bind_neu(self_varname, ty.clone()).quote_ty(&r_eval.eval_ty(ty_s)),
                        )
                    })
                    .collect();
                let record_ty_s = TyS::record(RecordS::new(r.fields0.clone(), fields1));
                if r.specializations.is_empty() {
                    record_ty_s
                } else {
                    TyS::specialize(record_ty_s, r.specializations.map(&|ty_v| self.quote_ty(ty_v)))
                }
            }
            TyV_::Sing(ty, tm) => TyS::sing(self.quote_ty(ty), self.quote_tm(tm)),
            TyV_::Unit => TyS::unit(),
        }
    }

    /** Produce term syntax from a term neutral.

    The documentation for [Evaluator::quote_ty] is also applicable here.
    */
    pub fn quote_neu(&self, n: &TmN) -> TmS {
        match &**n {
            TmN_::Var(i, name) => TmS::var(i.as_bwd(self.scope_length), *name),
            TmN_::Proj(tm, field) => TmS::proj(self.quote_neu(tm), *field),
        }
    }

    /** Produce term syntax from a term value.

    The documentation for [Evaluator::quote_ty] is also applicable here.
    */
    pub fn quote_tm(&self, tm: &TmV) -> TmS {
        match tm {
            TmV::Neu(n, _) => self.quote_neu(n),
            TmV::Cons(fields) => {
                TmS::cons(fields.iter().map(|(name, tm)| (*name, self.quote_tm(tm))).collect())
            }
            TmV::Tt => TmS::tt(),
        }
    }
}
