//! Evaluation, quoting, and conversion/equality checking.
//!
//! At a high level, this module implements three operations:
//!
//! - `eval : syntax -> value` ([Evaluator::eval_tm], [Evaluator::eval_ty])
//! - `quote : value -> syntax` ([Evaluator::quote_tm], [Evaluator::quote_neu], [Evaluator::quote_ty])
//! - `convertible? : value -> value -> bool` ([Evaluator::equal_tm], [Evaluator::element_of], [Evaluator::subtype])

use derive_more::Constructor;

use crate::{
    tt::{prelude::*, stx::*, toplevel::*, val::*},
    zero::LabelSegment,
};

/// The context used in evaluation, quoting, and conversion checking.
///
/// We bundle this all together because conversion checking and quoting
/// sometimes need to evaluate terms. For instance, quoting a lambda
/// involves evaluating the body of the lambda in the context of a freshly
/// introduced variable; even though we don't have lambdas, a similar
/// point applies to dependent records.
#[derive(Constructor, Clone)]
pub struct Evaluator<'a> {
    toplevel: &'a Toplevel,
    env: Env,
    // The next neutral
    scope_length: usize,
}

impl<'a> Evaluator<'a> {
    /// Constructs a new [Evaluator] with empty environment.
    pub fn empty(toplevel: &'a Toplevel) -> Self {
        Self::new(toplevel, Env::Nil, 0)
    }

    /// Return a new [Evaluator] with environment `env`.
    pub fn with_env(&self, env: Env) -> Self {
        Self { env, ..self.clone() }
    }

    fn eval_record(&self, fields: &Row<BaseTyS>) -> RecordV {
        RecordV::new(self.env.clone(), fields.clone(), Dtry::empty())
    }

    /// Evaluate type syntax to produce a type value.
    ///
    /// Assumes that the type syntax is well-formed and well-scoped with respect
    /// to self.env.
    pub fn eval_ty(&self, ty: &BaseTyS) -> BaseTyV {
        match &**ty {
            BaseTyS_::TopVar(tv) => match self.toplevel.declarations.get(tv).unwrap() {
                TopDecl::Type(t) => t.val.clone(),
                // Instances are fiber types, not base types, so a base
                // top-var never refers to one (the elaborator rejects an
                // instance name in base-type position before we get here).
                _ => panic!("top-level {tv} should be a type declaration"),
            },
            BaseTyS_::Object(ot) => BaseTyV::object(ot.clone()),
            BaseTyS_::Morphism(pt, dom, cod) => {
                BaseTyV::morphism(pt.clone(), self.eval_tm(dom), self.eval_tm(cod))
            }
            BaseTyS_::Record(r) => BaseTyV::record(self.eval_record(r)),
            BaseTyS_::Sing(ty_s, tm_s) => BaseTyV::sing(self.eval_ty(ty_s), self.eval_tm(tm_s)),
            BaseTyS_::Id(ty_s, tm_s1, tm_s2) => {
                BaseTyV::id(self.eval_ty(ty_s), self.eval_tm(tm_s1), self.eval_tm(tm_s2))
            }
            BaseTyS_::Specialize(ty_s, specializations) => {
                specializations.iter().fold(self.eval_ty(ty_s), |ty_v, (path, s)| {
                    ty_v.add_specialization(path, self.eval_ty(s))
                })
            }
            BaseTyS_::Meta(mv) => BaseTyV::meta(*mv),
        }
    }

    /// Evaluate term syntax to produce a term value.
    ///
    /// Assumes that the term syntax is well-formed and well-scoped with respect
    /// to self.env.
    pub fn eval_tm(&self, tm: &BaseTmS) -> BaseTmV {
        match &**tm {
            BaseTmS_::TopApp(tv, args_s) => {
                let env = Env::nil().extend_by(args_s.iter().map(|arg_s| self.eval_tm(arg_s)));
                let def = self.toplevel.declarations.get(tv).unwrap().clone().unwrap_def();
                self.with_env(env).eval_tm(&def.body)
            }
            BaseTmS_::Var(i, _, _) => self.env.get(**i).cloned().unwrap(),
            BaseTmS_::Cons(fields) => BaseTmV::cons(fields.map(|tm| self.eval_tm(tm))),
            BaseTmS_::Proj(tm, field, label) => self.proj(&self.eval_tm(tm), *field, *label),
            BaseTmS_::Id(x) => BaseTmV::id(self.eval_tm(x)),
            BaseTmS_::Tab(mor) => BaseTmV::tab(self.eval_tm(mor)),
            BaseTmS_::Compose(f, g) => BaseTmV::compose(self.eval_tm(f), self.eval_tm(g)),
            BaseTmS_::ObApp(name, x) => BaseTmV::app(*name, self.eval_tm(x)),
            BaseTmS_::List(elems) => {
                BaseTmV::list(elems.iter().map(|tm| self.eval_tm(tm)).collect())
            }
            BaseTmS_::Meta(mv) => BaseTmV::meta(*mv),
        }
    }

    /// Compute the projection of a field from a term value.
    pub fn proj(&self, tm: &BaseTmV, field_name: FieldName, field_label: LabelSegment) -> BaseTmV {
        match &**tm {
            BaseTmV_::Neu(n, ty) => BaseTmV::neu(
                TmN::proj(n.clone(), field_name, field_label),
                self.field_ty(ty, tm, field_name),
            ),
            BaseTmV_::Cons(fields) => fields.get(field_name).cloned().unwrap(),
            _ => unreachable!("projected field {field_name} from a non-record term value"),
        }
    }

    /// Evaluate the type of the field `field_name` of `val : ty`.
    pub fn field_ty(&self, ty: &BaseTyV, val: &BaseTmV, field_name: FieldName) -> BaseTyV {
        match &**ty {
            BaseTyV_::Record(r) => {
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

    /// Bind a new neutral of type `ty`.
    pub fn bind_neu(&self, name: VarName, label: LabelSegment, ty: BaseTyV) -> (TmN, Self) {
        let n = TmN::var(self.scope_length.into(), name, label);
        let v = BaseTmV::neu(n.clone(), ty);
        (
            n,
            Self {
                env: self.env.snoc(v),
                scope_length: self.scope_length + 1,
                ..self.clone()
            },
        )
    }

    /// Bind a variable called "self" to `ty`.
    pub fn bind_self(&self, ty: BaseTyV) -> (TmN, Self) {
        self.bind_neu("self".into(), "self".into(), ty)
    }

    /// Produce type syntax from a type value.
    ///
    /// This is a *section* of eval, in that `self.eval_ty(self.quote_ty(ty_v)) == ty_v`
    /// but it is not necessarily true that `self.quote_ty(self.eval_ty(ty_s)) == ty_v`.
    ///
    /// This is used for displaying [BaseTyV] to the user in type errors, and for
    /// creating syntax that can be re-evaluated in other contexts. In theory this
    /// could be used for conversion checking, but it's more efficient to implement
    /// that directly, and it's better to *not* do eta-expansion for user-facing
    /// messages or for syntax that is meant to be re-evaluated.
    pub fn quote_ty(&self, ty: &BaseTyV) -> BaseTyS {
        match &**ty {
            BaseTyV_::Object(object_type) => BaseTyS::object(object_type.clone()),
            BaseTyV_::Morphism(morphism_type, dom, cod) => {
                BaseTyS::morphism(morphism_type.clone(), self.quote_tm(dom), self.quote_tm(cod))
            }
            BaseTyV_::Record(r) => {
                let r_eval = self.with_env(r.env.clone()).bind_self(ty.clone()).1;
                let fields = r
                    .fields
                    .map(|ty_s| self.bind_self(ty.clone()).1.quote_ty(&r_eval.eval_ty(ty_s)));
                let record_ty_s = BaseTyS::record(fields);
                if r.specializations.is_empty() {
                    record_ty_s
                } else {
                    BaseTyS::specialize(
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
            BaseTyV_::Sing(ty, tm) => BaseTyS::sing(self.quote_ty(ty), self.quote_tm(tm)),
            BaseTyV_::Id(ty, tm1, tm2) => {
                BaseTyS::id(self.quote_ty(ty), self.quote_tm(tm1), self.quote_tm(tm2))
            }
            BaseTyV_::Meta(mv) => BaseTyS::meta(*mv),
        }
    }

    /// Produce term syntax from a neutral term.
    ///
    /// The documentation for [Evaluator::quote_ty] is also applicable here.
    pub fn quote_neu(&self, n: &TmN) -> BaseTmS {
        match &**n {
            TmN_::Var(i, name, label) => BaseTmS::var(i.as_bwd(self.scope_length), *name, *label),
            TmN_::Proj(tm, field, label) => BaseTmS::proj(self.quote_neu(tm), *field, *label),
        }
    }

    /// Produce term syntax from a term value.
    ///
    /// The documentation for [Evaluator::quote_ty] is also applicable here.
    pub fn quote_tm(&self, tm: &BaseTmV) -> BaseTmS {
        match &**tm {
            BaseTmV_::Neu(n, _) => self.quote_neu(n),
            BaseTmV_::App(name, x) => BaseTmS::ob_app(*name, self.quote_tm(x)),
            BaseTmV_::List(elems) => {
                BaseTmS::list(elems.iter().map(|tm| self.quote_tm(tm)).collect())
            }
            BaseTmV_::Cons(fields) => BaseTmS::cons(fields.map(|tm| self.quote_tm(tm))),
            BaseTmV_::Id(x) => BaseTmS::id(self.quote_tm(x)),
            BaseTmV_::Tab(mor) => BaseTmS::tab(self.quote_tm(mor)),
            BaseTmV_::Compose(f, g) => BaseTmS::compose(self.quote_tm(f), self.quote_tm(g)),
            BaseTmV_::Meta(mv) => BaseTmS::meta(*mv),
        }
    }

    /// Check if `ty1` is a subtype of `ty2`.
    ///
    /// This is true iff `ty1` is convertible with `ty2`, and an eta-expanded
    /// neutral of type `ty1` is an element of `ty2`.
    pub fn subtype<'b>(&self, ty1: &BaseTyV, ty2: &BaseTyV) -> Result<(), D<'b>> {
        self.convertible_ty(ty1, ty2)?;
        let (n, _) = self.bind_self(ty1.clone());
        let v = self.eta_neu(&n, ty1);
        self.element_of(&v, ty2)
    }

    /// Check if `tm` is an element of `ty`, accounting for specializations
    /// of `ty`.
    ///
    /// Precondition: the type of `tm` must be convertible with `ty`, and `tm`
    /// is eta-expanded.
    ///
    /// Example: if `a : Entity` and `b : Entity` are neutrals, then `a` is not an
    /// element of `@sing b`, but `a` is an element of `@sing a`.
    pub fn element_of<'b>(&self, tm: &BaseTmV, ty: &BaseTyV) -> Result<(), D<'b>> {
        match &**ty {
            BaseTyV_::Object(_) => Ok(()),
            BaseTyV_::Morphism(_, _, _) => Ok(()),
            BaseTyV_::Record(r) => {
                for (name, (label, _)) in r.fields.iter() {
                    self.element_of(&self.proj(tm, *name, *label), &self.field_ty(ty, tm, *name))?
                }
                Ok(())
            }
            BaseTyV_::Sing(_, x) => self.equal_tm(tm, x),
            BaseTyV_::Id(_, _, _) => Ok(()),
            BaseTyV_::Meta(_) => Ok(()),
        }
    }

    /// Check if two types are convertible.
    ///
    /// Ignores specializations: specializations are handled in [`Evaluator::subtype`].
    ///
    /// On failure, returns a doc which describes the obstruction to convertibility.
    pub fn convertible_ty<'b>(&self, ty1: &BaseTyV, ty2: &BaseTyV) -> Result<(), D<'b>> {
        match (&**ty1, &**ty2) {
            (BaseTyV_::Object(ot1), BaseTyV_::Object(ot2)) => {
                if ot1 == ot2 {
                    Ok(())
                } else {
                    Err(t(format!("object types {ot1} and {ot2} are not equal")))
                }
            }
            (BaseTyV_::Morphism(mt1, dom1, cod1), BaseTyV_::Morphism(mt2, dom2, cod2)) => {
                if mt1 != mt2 {
                    return Err(t(format!("morphism types {mt1} and {mt2} are not equal")));
                }
                self.equal_tm(dom1, dom2).map_err(|d| t("could not convert domains: ") + d)?;
                self.equal_tm(cod1, cod2).map_err(|d| t("could not convert codomains: ") + d)?;
                Ok(())
            }
            (BaseTyV_::Record(r1), BaseTyV_::Record(r2)) => {
                let mut fields = IndexMap::new();
                let mut self1 = self.clone();
                for ((name, (label, field_ty1_s)), (_, (_, field_ty2_s))) in
                    r1.fields.iter().zip(r2.fields.iter())
                {
                    let v = BaseTmV::cons(fields.clone().into());
                    let field_ty1_v = self1.with_env(r1.env.snoc(v.clone())).eval_ty(field_ty1_s);
                    let field_ty2_v = self1.with_env(r2.env.snoc(v.clone())).eval_ty(field_ty2_s);
                    self1.convertible_ty(&field_ty1_v, &field_ty2_v)?;
                    let (field_val, self_next) = self.bind_neu(*name, *label, field_ty1_v.clone());
                    self1 = self_next;
                    fields.insert(*name, (*label, BaseTmV::neu(field_val, field_ty1_v)));
                }
                Ok(())
            }
            (BaseTyV_::Sing(ty1, _), _) => self.convertible_ty(ty1, ty2),
            (_, BaseTyV_::Sing(ty2, _)) => self.convertible_ty(ty1, ty2),
            _ => Err(t("tried to convert between types of different type constructors")),
        }
    }

    /// Performs eta-expansion of the neutral `n` at type `ty`.
    pub fn eta_neu(&self, n: &TmN, ty: &BaseTyV) -> BaseTmV {
        match &**ty {
            BaseTyV_::Object(_) => BaseTmV::neu(n.clone(), ty.clone()),
            BaseTyV_::Morphism(_, _, _) => BaseTmV::neu(n.clone(), ty.clone()),
            BaseTyV_::Record(r) => {
                let mut fields = Row::empty();
                for (name, (label, _)) in r.fields.iter() {
                    let ty_v = self.field_ty(ty, &BaseTmV::cons(fields.clone()), *name);
                    let v = self.eta_neu(&TmN::proj(n.clone(), *name, *label), &ty_v);
                    fields.insert(*name, *label, v);
                }
                BaseTmV::cons(fields)
            }
            BaseTyV_::Sing(_, x) => x.clone(),
            BaseTyV_::Id(_, _, _) => BaseTmV::empty_cons(), /* Extensional equality at a 100% discount! */
            BaseTyV_::Meta(_) => BaseTmV::neu(n.clone(), ty.clone()),
        }
    }

    /// Performs eta-expansion of the term `v` at type `ty`.
    pub fn eta(&self, v: &BaseTmV, ty: Option<&BaseTyV>) -> BaseTmV {
        match &**v {
            BaseTmV_::Neu(tm_n, ty_v) => self.eta_neu(tm_n, ty_v),
            BaseTmV_::App(name, x) => BaseTmV::app(*name, self.eta(x, None)),
            BaseTmV_::List(elems) => {
                BaseTmV::list(elems.iter().map(|elem| self.eta(elem, None)).collect())
            }
            BaseTmV_::Cons(row) => {
                if let Some(ty) = ty {
                    let row = row
                        .iter()
                        .map(|(name, (label, field_v))| {
                            (*name, (*label, self.eta(field_v, Some(&self.field_ty(ty, v, *name)))))
                        })
                        .collect();
                    BaseTmV::cons(row)
                }
                // Is this right? Couldn't a cons be nested below top-level and so not get expanded right?
                else {
                    v.clone()
                }
            }
            BaseTmV_::Id(x) => BaseTmV::id(self.eta(x, None)),
            BaseTmV_::Tab(mor) => BaseTmV::tab(self.eta(mor, None)),
            BaseTmV_::Compose(f, g) => BaseTmV::compose(self.eta(f, None), self.eta(g, None)),
            BaseTmV_::Meta(_) => v.clone(),
        }
    }

    /// Check if two terms are definitionally equal.
    ///
    /// On failure, returns a doc which describes the obstruction to convertibility.
    ///
    /// Assumes that the type of tm1 is convertible with the type of tm2. First
    /// attempts to do conversion checking without eta-expansion (strict mode),
    /// and if that fails, does conversion checking with eta-expansion.
    pub fn equal_tm<'b>(&self, tm1: &BaseTmV, tm2: &BaseTmV) -> Result<(), D<'b>> {
        if self.equal_tm_helper(tm1, tm2, true, true).is_err() {
            self.equal_tm_helper(tm1, tm2, false, false)
        } else {
            Ok(())
        }
    }

    fn equal_tm_helper<'b>(
        &self,
        tm1: &BaseTmV,
        tm2: &BaseTmV,
        strict1: bool,
        strict2: bool,
    ) -> Result<(), D<'b>> {
        match (&**tm1, &**tm2) {
            (BaseTmV_::Neu(n1, ty1), _) if !strict1 => {
                self.equal_tm_helper(&self.eta_neu(n1, ty1), tm2, true, strict2)
            }
            (_, BaseTmV_::Neu(n2, ty2)) if !strict2 => {
                self.equal_tm_helper(tm1, &self.eta_neu(n2, ty2), strict1, true)
            }
            (BaseTmV_::Neu(n1, _), BaseTmV_::Neu(n2, _)) => {
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
            (BaseTmV_::Cons(fields1), BaseTmV_::Cons(fields2)) => {
                for ((_, (_, tm1)), (_, (_, tm2))) in fields1.iter().zip(fields2.iter()) {
                    self.equal_tm_helper(tm1, tm2, strict1, strict2)?
                }
                Ok(())
            }
            (BaseTmV_::Meta(mv1), BaseTmV_::Meta(mv2)) => {
                if mv1 == mv2 {
                    Ok(())
                } else {
                    Err(t(format!("Holes {} and {} are not equal.", mv1, mv2)))
                }
            }
            (BaseTmV_::Id(x1), BaseTmV_::Id(x2)) => self.equal_tm_helper(x1, x2, strict1, strict2),
            (BaseTmV_::Compose(f1, g1), BaseTmV_::Compose(f2, g2)) => {
                self.equal_tm_helper(f1, f2, strict1, strict2)?;
                self.equal_tm_helper(g1, g2, strict1, strict2)
            }
            (BaseTmV_::Tab(mor1), BaseTmV_::Tab(mor2)) => {
                self.equal_tm_helper(mor1, mor2, strict1, strict2)
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
        ty: &BaseTyV,
        val: &BaseTmV,
        path: &[(FieldName, LabelSegment)],
        field_ty: BaseTyV,
    ) -> Result<(), String> {
        assert!(!path.is_empty());
        let orig_field_ty = self.path_ty(ty, val, path)?;
        self.subtype(&field_ty, &orig_field_ty).map_err(|msg| {
            format!(
                "{} is not a subtype of {}:\n... because {}",
                self.quote_ty(&field_ty),
                self.quote_ty(&orig_field_ty),
                msg.pretty()
            )
        })
    }

    /// Walk `path` from the value `val` of record type `ty`, returning
    /// the type of the field at the end of the path.
    ///
    /// An empty path returns `ty` unchanged. Each segment requires the
    /// current type to be a record containing the named field.
    pub fn path_ty(
        &self,
        ty: &BaseTyV,
        val: &BaseTmV,
        path: &[(FieldName, LabelSegment)],
    ) -> Result<BaseTyV, String> {
        let mut ty = ty.clone();
        let mut val = val.clone();
        for &(name, label) in path {
            let BaseTyV_::Record(r) = &*ty.clone() else {
                return Err(format!("expected a record type at .{label}"));
            };
            if !r.fields.has(name) {
                return Err(format!("no such field .{label}"));
            }
            let next_ty = self.field_ty(&ty, &val, name);
            let next_val = self.proj(&val, name, label);
            ty = next_ty;
            val = next_val;
        }
        Ok(ty)
    }

    /// Try to specialize the record `r` with the subtype `ty` at `path`.
    ///
    /// Precondition: `path` is non-empty.
    pub fn try_specialize(
        &self,
        ty: &BaseTyV,
        path: &[(FieldName, LabelSegment)],
        field_ty: BaseTyV,
    ) -> Result<BaseTyV, String> {
        let (self_var, _) = self.bind_self(ty.clone());
        let self_val = self.eta_neu(&self_var, ty);
        self.can_specialize(ty, &self_val, path, field_ty.clone())?;
        let BaseTyV_::Record(r) = &**ty else {
            panic!("Input to `try_specialize` should be a record type")
        };
        Ok(BaseTyV::record(r.add_specialization(path, field_ty)))
    }

    // --- Fiber-world NbE and conversion ---------------------------------
    //
    // Fiber types/terms carry no closures or computation rules (every
    // fiber term is neutral), so there is no fiber eval/quote: the
    // elaborator builds [`FiberTyS`]/[`FiberTyV`] (and the term sorts) in
    // parallel. What remains is conversion checking and field projection.

    /// The fiber type of field `field` of a fiber record type, if present.
    ///
    /// Only [`Over`](FiberTyV_::Over) generator fields are ever projected
    /// (as `we.e`); their types are closed, so this is a plain lookup with
    /// no environment.
    pub fn fiber_field_ty(&self, ty: &FiberTyV, field: FieldName) -> Option<FiberTyV> {
        match &**ty {
            FiberTyV_::Record(r) => r.get(field).cloned(),
            _ => None,
        }
    }

    /// Check that two fiber types are convertible.
    pub fn convertible_fiber_ty<'b>(&self, ty1: &FiberTyV, ty2: &FiberTyV) -> Result<(), D<'b>> {
        match (&**ty1, &**ty2) {
            (FiberTyV_::Over(p1), FiberTyV_::Over(p2)) => {
                if p1 == p2 {
                    Ok(())
                } else {
                    Err(t("over-types refer to different paths in the codomain"))
                }
            }
            (FiberTyV_::Record(r1), FiberTyV_::Record(r2)) => {
                if r1.iter().count() != r2.iter().count() {
                    return Err(t("instance records have differing shapes"));
                }
                for ((n1, (_, f1)), (n2, (_, f2))) in r1.iter().zip(r2.iter()) {
                    if n1 != n2 {
                        return Err(t(format!("instance field {n1} differs from {n2}")));
                    }
                    self.convertible_fiber_ty(f1, f2)?;
                }
                Ok(())
            }
            (FiberTyV_::Id(ty1, l1, r1), FiberTyV_::Id(ty2, l2, r2)) => {
                self.convertible_fiber_ty(ty1, ty2)?;
                self.equal_fiber_tm(l1, l2)?;
                self.equal_fiber_tm(r1, r2)
            }
            _ => Err(t("tried to convert between fiber types of different constructors")),
        }
    }

    /// Check that two fiber terms are equal. Fiber terms are all neutral,
    /// so this is structural.
    pub fn equal_fiber_tm<'b>(&self, tm1: &FiberTmV, tm2: &FiberTmV) -> Result<(), D<'b>> {
        match (&**tm1, &**tm2) {
            (FiberTmV_::Var(i1, _, _), FiberTmV_::Var(i2, _, _)) => {
                if i1 == i2 {
                    Ok(())
                } else {
                    Err(t("fiber variables are not equal"))
                }
            }
            (FiberTmV_::Proj(t1, f1, _), FiberTmV_::Proj(t2, f2, _)) => {
                if f1 != f2 {
                    return Err(t(format!("fiber projections {f1} and {f2} are not equal")));
                }
                self.equal_fiber_tm(t1, t2)
            }
            (FiberTmV_::OverApp(m1, _, _, i1), FiberTmV_::OverApp(m2, _, _, i2)) => {
                if m1 != m2 {
                    return Err(t(format!("OverApp morphisms {m1} and {m2} are not equal")));
                }
                self.equal_fiber_tm(i1, i2)
            }
            (FiberTmV_::Meta(a), FiberTmV_::Meta(b)) => {
                if a == b {
                    Ok(())
                } else {
                    Err(t(format!("Holes {a} and {b} are not equal.")))
                }
            }
            _ => Err(t("fiber terms are not equal")),
        }
    }
}
