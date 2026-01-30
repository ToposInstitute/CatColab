//! Evaluation, quoting, and conversion/equality checking
//!
//! At a high level, this module implements three operations:
//!
//! - `eval : syntax -> value` ([Evaluator::eval_tm], [Evaluator::eval_ty])
//! - `quote : value -> syntax` ([Evaluator::quote_tm], [Evaluator::quote_neu], [Evaluator::quote_ty])
//! - `convertable? : value -> value -> bool` ([Evaluator::equal_tm], [Evaluator::element_of], [Evaluator::subtype])

use derive_more::Constructor;

use crate::{
    tt::{prelude::*, stx::*, toplevel::*, val::*},
    zero::LabelSegment,
};

/// The context used in evaluation, quoting, and conversion checking
///
/// We bundle this all together because conversion checking and quoting
/// sometimes need to evaluate terms. For instance, quoting a lambda
/// involves evaluating the body of the lambda in the context of a freshly
/// introduced variable; even though we don't have lambdas, a similar
/// thing applies to dependent records.
#[derive(Constructor, Clone)]
pub struct Evaluator<'a> {
    toplevel: &'a Toplevel,
    env: Env,
    // The next neutral
    scope_length: usize,
}

impl<'a> Evaluator<'a> {
    fn eval_record(&self, r: &RecordS) -> RecordV {
        RecordV::new(self.env.clone(), r.fields.clone(), Dtry::empty())
    }

    /// Return a new [Evaluator] with environment `env`
    pub fn with_env(&self, env: Env) -> Self {
        Self {
            env,
            ..self.clone()
        }
    }

    /// Evaluate type syntax to produce a type value
    ///
    /// Assumes that the type syntax is well-formed and well-scoped with respect
    /// to self.env
    pub fn eval_ty(&self, ty: &TyS) -> TyV {
        match &**ty {
            TyS_::TopVar(tv) => self.toplevel.declarations.get(tv).unwrap().clone().unwrap_ty().val,
            TyS_::Object(ot) => TyV::object(ot.clone()),
            TyS_::Morphism(pt, dom, cod) => {
                TyV::morphism(pt.clone(), self.eval_tm(dom), self.eval_tm(cod))
            }
            TyS_::Record(r) => TyV::record(self.eval_record(r)),
            TyS_::Sing(ty_s, tm_s) => TyV::sing(self.eval_ty(ty_s), self.eval_tm(tm_s)),
            TyS_::Specialize(ty_s, specializations) => {
                specializations.iter().fold(self.eval_ty(ty_s), |ty_v, (path, s)| {
                    ty_v.add_specialization(path, self.eval_ty(s))
                })
            }
            TyS_::Unit => TyV::unit(),
            TyS_::Meta(mv) => TyV::meta(*mv),
        }
    }

    /// Evaluate term syntax to produce a term value
    ///
    /// Assumes that the term syntax is well-formed and well-scoped with respect
    /// to self.env
    pub fn eval_tm(&self, tm: &TmS) -> TmV {
        match &**tm {
            TmS_::TopVar(tv) => {
                self.toplevel.declarations.get(tv).unwrap().clone().unwrap_const().val
            }
            TmS_::TopApp(tv, args_s) => {
                let env = Env::nil().extend_by(args_s.iter().map(|arg_s| self.eval_tm(arg_s)));
                let def = self.toplevel.declarations.get(tv).unwrap().clone().unwrap_def();
                self.with_env(env).eval_tm(&def.body)
            }
            TmS_::Var(i, _, _) => self.env.get(**i).cloned().unwrap(),
            TmS_::Cons(fields) => TmV::Cons(fields.map(|tm| self.eval_tm(tm))),
            TmS_::Proj(tm, field, label) => self.proj(&self.eval_tm(tm), *field, *label),
            TmS_::Tt => TmV::Tt,
            TmS_::Id(_) => TmV::Opaque,
            TmS_::Compose(_, _) => TmV::Opaque,
            TmS_::Opaque => TmV::Opaque,
            TmS_::Meta(mv) => TmV::Meta(*mv),
        }
    }

    /// Compute the projection of a field from a term value
    pub fn proj(&self, tm: &TmV, field_name: FieldName, field_label: LabelSegment) -> TmV {
        match tm {
            TmV::Neu(n, ty) => TmV::Neu(
                TmN::proj(n.clone(), field_name, field_label),
                self.field_ty(ty, tm, field_name),
            ),
            TmV::Cons(fields) => fields.get(field_name).cloned().unwrap(),
            _ => panic!(),
        }
    }

    /// Evaluate the type of the field `field_name` of `val : ty`.
    pub fn field_ty(&self, ty: &TyV, val: &TmV, field_name: FieldName) -> TyV {
        match &**ty {
            TyV_::Record(r) => {
                let field_ty_s = r.fields.get(field_name).unwrap();
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

    /// Bind a new neutral of type `ty`
    pub fn bind_neu(&self, name: VarName, label: LabelSegment, ty: TyV) -> (TmN, Self) {
        let n = TmN::var(self.scope_length.into(), name, label);
        let v = TmV::Neu(n.clone(), ty);
        (
            n,
            Self {
                env: self.env.snoc(v),
                scope_length: self.scope_length + 1,
                ..self.clone()
            },
        )
    }

    /// Bind a variable called "self" to `ty`
    pub fn bind_self(&self, ty: TyV) -> (TmN, Self) {
        self.bind_neu(name_seg("self"), label_seg("self"), ty)
    }

    /// Produce type syntax from a type value.
    ///
    /// This is a *section* of eval, in that `self.eval_ty(self.quote_ty(ty_v)) == ty_v`
    /// but it is not necessarily true that `self.quote_ty(self.eval_ty(ty_s)) == ty_v`.
    ///
    /// This is used for displaying [TyV] to the user in type errors, and for
    /// creating syntax that can be re-evaluated in other contexts. In theory this
    /// could be used for conversion checking, but it's more efficient to implement
    /// that directly, and it's better to *not* do eta-expansion for user-facing
    /// messages or for syntax that is meant to be re-evaluated.
    pub fn quote_ty(&self, ty: &TyV) -> TyS {
        match &**ty {
            TyV_::Object(object_type) => TyS::object(object_type.clone()),
            TyV_::Morphism(morphism_type, dom, cod) => {
                TyS::morphism(morphism_type.clone(), self.quote_tm(dom), self.quote_tm(cod))
            }
            TyV_::Record(r) => {
                let r_eval = self.with_env(r.env.clone()).bind_self(ty.clone()).1;
                let fields1 = r
                    .fields
                    .map(|ty_s| self.bind_self(ty.clone()).1.quote_ty(&r_eval.eval_ty(ty_s)));
                let record_ty_s = TyS::record(RecordS::new(fields1));
                if r.specializations.is_empty() {
                    record_ty_s
                } else {
                    TyS::specialize(
                        record_ty_s,
                        r.specializations
                            .flatten()
                            .into_iter()
                            .map(|(name, label, ty_v)| {
                                (
                                    name.segments()
                                        .copied()
                                        .zip(label.segments().copied())
                                        .collect::<Vec<_>>(),
                                    self.quote_ty(&ty_v),
                                )
                            })
                            .collect(),
                    )
                }
            }
            TyV_::Sing(ty, tm) => TyS::sing(self.quote_ty(ty), self.quote_tm(tm)),
            TyV_::Unit => TyS::unit(),
            TyV_::Meta(mv) => TyS::meta(*mv),
        }
    }

    /// Produce term syntax from a term neutral.
    ///
    /// The documentation for [Evaluator::quote_ty] is also applicable here.
    pub fn quote_neu(&self, n: &TmN) -> TmS {
        match &**n {
            TmN_::Var(i, name, label) => TmS::var(i.as_bwd(self.scope_length), *name, *label),
            TmN_::Proj(tm, field, label) => TmS::proj(self.quote_neu(tm), *field, *label),
        }
    }

    /// Produce term syntax from a term value.
    ///
    /// The documentation for [Evaluator::quote_ty] is also applicable here.
    pub fn quote_tm(&self, tm: &TmV) -> TmS {
        match tm {
            TmV::Neu(n, _) => self.quote_neu(n),
            TmV::Cons(fields) => TmS::cons(fields.map(|tm| self.quote_tm(tm))),
            TmV::Tt => TmS::tt(),
            TmV::Opaque => TmS::opaque(),
            TmV::Meta(mv) => TmS::meta(*mv),
        }
    }

    /// Check if `ty1` is a subtype of `ty2`.
    ///
    /// This is true iff `ty1` is convertable with `ty2`, and an eta-expanded
    /// neutral of type `ty1` is an element of `ty2`.
    pub fn subtype<'b>(&self, ty1: &TyV, ty2: &TyV) -> Result<(), D<'b>> {
        self.convertable_ty(ty1, ty2)?;
        let (n, _) = self.bind_self(ty1.clone());
        let v = self.eta_neu(&n, ty1);
        self.element_of(&v, ty2)
    }

    /// Check if `tm` is an element of `ty`, accounting for specializations
    /// of `ty`.
    ///
    /// Precondition: the type of `tm` must be convertable with `ty`, and `tm`
    /// is eta-expanded.
    ///
    /// Example: if `a : Entity` and `b : Entity` are neutrals, then `a` is not an
    /// element of `@sing b`, but `a` is an element of `@sing a`.
    pub fn element_of<'b>(&self, tm: &TmV, ty: &TyV) -> Result<(), D<'b>> {
        match &**ty {
            TyV_::Object(_) => Ok(()),
            TyV_::Morphism(_, _, _) => Ok(()),
            TyV_::Record(r) => {
                for (name, (label, _)) in r.fields.iter() {
                    self.element_of(&self.proj(tm, *name, *label), &self.field_ty(ty, tm, *name))?
                }
                Ok(())
            }
            TyV_::Sing(_, x) => self.equal_tm(tm, x),
            TyV_::Unit => Ok(()),
            TyV_::Meta(_) => Ok(()),
        }
    }

    /// Check if two types are convertable.
    ///
    /// Ignores specializations: specializations are handled in [Evaluator::subtype]
    ///
    /// On failure, returns a doc which describes the obstruction to convertability.
    pub fn convertable_ty<'b>(&self, ty1: &TyV, ty2: &TyV) -> Result<(), D<'b>> {
        match (&**ty1, &**ty2) {
            (TyV_::Object(ot1), TyV_::Object(ot2)) => {
                if ot1 == ot2 {
                    Ok(())
                } else {
                    Err(t(format!("object types {ot1} and {ot2} are not equal")))
                }
            }
            (TyV_::Morphism(mt1, dom1, cod1), TyV_::Morphism(mt2, dom2, cod2)) => {
                if mt1 != mt2 {
                    return Err(t(format!("morphism types {mt1} and {mt2} are not equal")));
                }
                self.equal_tm(dom1, dom2).map_err(|d| t("could not convert domains: ") + d)?;
                self.equal_tm(cod1, cod2).map_err(|d| t("could not convert codomains: ") + d)?;
                Ok(())
            }
            (TyV_::Record(r1), TyV_::Record(r2)) => {
                let mut fields = IndexMap::new();
                let mut self1 = self.clone();
                for ((name, (label, field_ty1_s)), (_, (_, field_ty2_s))) in
                    r1.fields.iter().zip(r2.fields.iter())
                {
                    let v = TmV::Cons(fields.clone().into());
                    let field_ty1_v = self1.with_env(r1.env.snoc(v.clone())).eval_ty(field_ty1_s);
                    let field_ty2_v = self1.with_env(r2.env.snoc(v.clone())).eval_ty(field_ty2_s);
                    self1.convertable_ty(&field_ty1_v, &field_ty2_v)?;
                    let (field_val, self_next) = self.bind_neu(*name, *label, field_ty1_v.clone());
                    self1 = self_next;
                    fields.insert(*name, (*label, TmV::Neu(field_val, field_ty1_v)));
                }
                Ok(())
            }
            (TyV_::Sing(ty1, _), _) => self.convertable_ty(ty1, ty2),
            (_, TyV_::Sing(ty2, _)) => self.convertable_ty(ty1, ty2),
            (TyV_::Unit, TyV_::Unit) => Ok(()),
            _ => Err(t("tried to convert between types of different type constructors")),
        }
    }

    /// Performs eta-expansion of the neutral `n` at type `ty`.
    pub fn eta_neu(&self, n: &TmN, ty: &TyV) -> TmV {
        match &**ty {
            TyV_::Object(_) => TmV::Neu(n.clone(), ty.clone()),
            TyV_::Morphism(_, _, _) => TmV::Opaque,
            TyV_::Record(r) => {
                let mut fields = Row::empty();
                for (name, (label, _)) in r.fields.iter() {
                    let ty_v = self.field_ty(ty, &TmV::Cons(fields.clone()), *name);
                    let v = self.eta_neu(&TmN::proj(n.clone(), *name, *label), &ty_v);
                    fields = fields.insert(*name, *label, v);
                }
                TmV::Cons(fields)
            }
            TyV_::Sing(_, x) => x.clone(),
            TyV_::Unit => TmV::Tt,
            TyV_::Meta(_) => TmV::Neu(n.clone(), ty.clone()),
        }
    }

    /// Performs eta-expansion of the term `n` at type `ty`
    pub fn eta(&self, v: &TmV, ty: &TyV) -> TmV {
        match v {
            TmV::Neu(tm_n, ty_v) => self.eta_neu(tm_n, ty_v),
            TmV::Cons(row) => TmV::Cons(
                row.iter()
                    .map(|(name, (label, field_v))| {
                        (*name, (*label, self.eta(field_v, &self.field_ty(ty, v, *name))))
                    })
                    .collect(),
            ),
            TmV::Tt => TmV::Tt,
            TmV::Opaque => TmV::Opaque,
            TmV::Meta(_) => v.clone(),
        }
    }

    /// Check if two terms are definitionally equal.
    ///
    /// On failure, returns a doc which describes the obstruction to convertability.
    ///
    /// Assumes that the base type of tm1 is convertable with the base type of tm2.
    /// First attempts to do conversion checking without eta-expansion (strict
    /// mode), and if that fails, does conversion checking with eta-expansion.
    pub fn equal_tm<'b>(&self, tm1: &TmV, tm2: &TmV) -> Result<(), D<'b>> {
        if self.equal_tm_helper(tm1, tm2, true, true).is_err() {
            self.equal_tm_helper(tm1, tm2, false, false)
        } else {
            Ok(())
        }
    }

    fn equal_tm_helper<'b>(
        &self,
        tm1: &TmV,
        tm2: &TmV,
        strict1: bool,
        strict2: bool,
    ) -> Result<(), D<'b>> {
        match (tm1, tm2) {
            (TmV::Neu(n1, ty1), _) if !strict1 => {
                self.equal_tm_helper(&self.eta_neu(n1, ty1), tm2, true, strict2)
            }
            (_, TmV::Neu(n2, ty2)) if !strict2 => {
                self.equal_tm_helper(tm1, &self.eta_neu(n2, ty2), strict1, true)
            }
            (TmV::Neu(n1, _), TmV::Neu(n2, _)) => {
                if n1 == n2 {
                    Ok(())
                } else {
                    Err(t(format!(
                        "Neutrals {} and {} are not equal.",
                        self.quote_neu(n1),
                        self.quote_neu(n2)
                    )))
                }
            }
            (TmV::Cons(fields1), TmV::Cons(fields2)) => {
                for ((_, (_, tm1)), (_, (_, tm2))) in fields1.iter().zip(fields2.iter()) {
                    self.equal_tm_helper(tm1, tm2, strict1, strict2)?
                }
                Ok(())
            }
            (TmV::Tt, TmV::Tt) => Ok(()),
            (TmV::Opaque, TmV::Opaque) => Ok(()),
            (TmV::Meta(mv1), TmV::Meta(mv2)) => {
                if mv1 == mv2 {
                    Ok(())
                } else {
                    Err(t(format!("Holes {} and {} are not equal.", mv1, mv2)))
                }
            }
            _ => Err(t(format!(
                "failed to match terms {} and {}",
                self.quote_tm(tm1),
                self.quote_tm(tm2)
            ))),
        }
    }

    fn can_specialize(
        &self,
        ty: &TyV,
        val: &TmV,
        path: &[(FieldName, LabelSegment)],
        field_ty: TyV,
    ) -> Result<(), String> {
        assert!(!path.is_empty());

        let TyV_::Record(r) = &**ty else {
            return Err("cannot specialize a non-record type".into());
        };

        let (field, path) = (path[0], &path[1..]);
        if !r.fields.has(field.0) {
            return Err(format!("no such field .{}", field.1));
        }
        let orig_field_ty = self.field_ty(ty, val, field.0);
        if path.is_empty() {
            self.subtype(&field_ty, &orig_field_ty).map_err(|msg| {
                format!(
                    "{} is not a subtype of {}:\n... because {}",
                    self.quote_ty(&field_ty),
                    self.quote_ty(&orig_field_ty),
                    msg.pretty()
                )
            })
        } else {
            self.can_specialize(&orig_field_ty, &self.proj(val, field.0, field.1), path, field_ty)
        }
    }

    /// Try to specialize the record `r` with the subtype `ty` at `path`
    ///
    /// Precondition: `path` is non-empty.
    pub fn try_specialize(
        &self,
        ty: &TyV,
        path: &[(FieldName, LabelSegment)],
        field_ty: TyV,
    ) -> Result<TyV, String> {
        let (self_var, _) = self.bind_self(ty.clone());
        let self_val = self.eta_neu(&self_var, ty);
        self.can_specialize(ty, &self_val, path, field_ty.clone())?;
        let TyV_::Record(r) = &**ty else { panic!() };
        Ok(TyV::record(r.add_specialization(path, field_ty)))
    }
}
