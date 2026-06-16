//! Elaboration from plain text for DoubleTT.

use fnotation::*;
use scopeguard::{ScopeGuard, guard};

use fnotation::{ParseConfig, parser::Prec};
use tattle::declare_error;

use super::{
    context::*, eval::*, modelgen::*, prelude::*, stx::*, theory::*, toplevel::*, val::*, wd::*,
};
use crate::{
    dbl::model::DblModelPrinter,
    zero::{QualifiedName, name},
};

/// Parser config for DoubleTT.
pub const TT_PARSE_CONFIG: ParseConfig = ParseConfig::new(
    &[
        (":", Prec::nonassoc(20)),
        (":=", Prec::nonassoc(10)),
        ("&", Prec::lassoc(40)),
        ("*", Prec::lassoc(60)),
        ("==", Prec::nonassoc(30)),
    ],
    &[":", ":=", "&", "Unit", "Hom", "*", "=="],
    &["type", "def", "syn", "chk", "norm", "generate", "uwd", "set_theory"],
);

/// The result of elaborating a top-level statement.
pub enum TopElabResult {
    /// A new declaration.
    Declaration(TopVarName, TopDecl),
    /// Output that should be logged.
    Output(String),
}

/// Context for top-level elaboration.
///
/// Top-level elaboration is elaboration of declarations.
pub struct TopElaborator {
    current_theory: Option<Theory>,
    reporter: Reporter,
}

impl TopElaborator {
    /// Constructs a context for top-level elaboration.
    pub fn new(reporter: Reporter) -> Self {
        Self { current_theory: None, reporter }
    }

    fn bare_def<'c>(&self, n: &FNtn<'c>) -> Option<(TopVarName, &'c FNtn<'c>)> {
        match n.ast0() {
            App2(L(_, Keyword(":=")), L(_, Var(name)), tn) => {
                Some((NameSegment::Text(ustr(name)), tn))
            }
            _ => None,
        }
    }

    fn annotated_def<'c>(
        &self,
        n: &FNtn<'c>,
    ) -> Option<(TopVarName, Option<&'c [&'c FNtn<'c>]>, &'c FNtn<'c>, &'c FNtn<'c>)> {
        match n.ast0() {
            App2(L(_, Keyword(":=")), L(_, App2(L(_, Keyword(":")), head_n, annotn)), valn) => {
                match head_n.ast0() {
                    App1(L(_, Var(name)), L(_, Tuple(args))) => {
                        Some((name_seg(*name), Some(args.as_slice()), annotn, valn))
                    }
                    Var(name) => Some((name_seg(*name), None, annotn, valn)),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    fn expr_with_context<'c>(&self, n: &'c FNtn<'c>) -> (&'c [&'c FNtn<'c>], &'c FNtn<'c>) {
        match n.ast0() {
            App1(L(_, Tuple(ctx_elems)), n) => (ctx_elems.as_slice(), n),
            _ => (&[], n),
        }
    }

    fn get_theory(&self, loc: Loc) -> Option<Theory> {
        let Some(theory) = &self.current_theory else {
            return self.error(
                loc,
                "have not yet set a theory, set a theory via `set_theory <THEORY_NAME>`",
            );
        };
        Some(theory.clone())
    }

    fn elaborator<'a>(&self, theory: &Theory, toplevel: &'a Toplevel) -> Elaborator<'a> {
        Elaborator::new(theory.clone(), self.reporter.clone(), toplevel)
    }

    fn error<T>(&self, loc: Loc, msg: impl Into<String>) -> Option<T> {
        self.reporter.error(loc, ELAB_ERROR, msg.into());
        None
    }

    /// Elaborate a single top-level declaration.
    pub fn elab(&mut self, toplevel: &Toplevel, tn: &FNtnTop) -> Option<TopElabResult> {
        match tn.name {
            "set_theory" => match tn.body.ast0() {
                Var(theory_name) => match toplevel.theory_library.get(&name(*theory_name)) {
                    Some(theory) => {
                        self.current_theory = Some(theory.clone());
                        Some(TopElabResult::Output(format!("set theory to {}", theory_name)))
                    }
                    None => self.error(tn.loc, format!("{theory_name} not found")),
                },
                _ => self.error(tn.loc, "expected a theory name"),
            },
            "type" => {
                let theory = self.get_theory(tn.loc)?;
                let (name, ty_n) = self.bare_def(tn.body).or_else(|| {
                    self.error(
                        tn.loc,
                        "unknown syntax for type declaration, expected <name> := <type>",
                    )
                })?;
                let (ty_s, ty_v) = self.elaborator(&theory, toplevel).ty(ty_n);
                Some(TopElabResult::Declaration(
                    name,
                    TopDecl::Type(Type::new(theory.clone(), ty_s, ty_v)),
                ))
            }
            "def" => {
                let theory = self.get_theory(tn.loc)?;
                let (name, args_n, ty_n, tm_n) = self.annotated_def(tn.body).or_else(|| {
                    self.error(
                        tn.loc,
                        "unknown syntax for term declaration, expected <name> : <type> := <term>",
                    )
                })?;
                match args_n {
                    Some(args_n) => {
                        let mut elab = self.elaborator(&theory, toplevel);
                        let mut args_stx = IndexMap::new();
                        for arg_n in args_n {
                            let (name, label, ty_s, ty_v) = elab.binding(arg_n)?;
                            args_stx.insert(name, (label, ty_s));
                            elab.intro(name, label, Some(ty_v));
                        }
                        let (ret_ty_s, ret_ty_v) = elab.ty(ty_n);
                        let (body_s, _) = elab.chk(&ret_ty_v, tm_n);
                        Some(TopElabResult::Declaration(
                            name,
                            TopDecl::Def(Def::new(
                                theory.clone(),
                                args_stx.into(),
                                ret_ty_s,
                                body_s,
                            )),
                        ))
                    }
                    None => {
                        let mut elab = self.elaborator(&theory, toplevel);
                        let (_, ret_ty_v) = elab.ty(ty_n);
                        let (tm_s, tm_v) = elab.chk(&ret_ty_v, tm_n);
                        // A term in the empty context. The body may be an
                        // ordinary constant or a [`TmV_::Instance`].
                        // Instance-ness is later read off the term value.
                        Some(TopElabResult::Declaration(
                            name,
                            TopDecl::DefConst(DefConst::new(theory.clone(), tm_s, tm_v, ret_ty_v)),
                        ))
                    }
                }
            }
            "syn" => {
                let theory = self.get_theory(tn.loc)?;
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                let mut elab = self.elaborator(&theory, toplevel);
                for ctx_n in ctx_ns {
                    let (name, label, _, ty_v) = elab.binding(ctx_n)?;
                    elab.intro(name, label, Some(ty_v));
                }
                let (tm_s, _, ty_v) = elab.syn(n);
                Some(TopElabResult::Output(format!(
                    "{tm_s} : {}",
                    elab.evaluator().quote_ty(&ty_v)
                )))
            }
            "norm" => {
                let theory = self.get_theory(tn.loc)?;
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                let mut elab = self.elaborator(&theory, toplevel);
                for ctx_n in ctx_ns {
                    let (name, label, _, ty_v) = elab.binding(ctx_n)?;
                    elab.intro(name, label, Some(ty_v));
                }
                let (_, tm_v, ty_v) = elab.syn(n);
                let eval = elab.evaluator();
                let tm_s = eval.quote_tm(&eval.eta(&tm_v, Some(&ty_v)));
                Some(TopElabResult::Output(format!("{tm_s}")))
            }
            "chk" => {
                let theory = self.get_theory(tn.loc)?;
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                let mut elab = self.elaborator(&theory, toplevel);
                for ctx_n in ctx_ns {
                    let (name, label, _, ty_v) = elab.binding(ctx_n)?;
                    elab.intro(name, label, Some(ty_v));
                }
                let (tm_n, ty_n) = match n.ast0() {
                    App2(L(_, Keyword(":")), tm_n, ty_n) => (tm_n, ty_n),
                    _ => return elab.error("expected <expr> : <type>"),
                };
                let (_, ty_v) = elab.ty(ty_n);
                let (tm_s, _) = elab.chk(&ty_v, tm_n);
                Some(TopElabResult::Output(format!("{tm_s}")))
            }
            "uwd" => {
                let theory = self.get_theory(tn.loc)?;
                let mut elab = self.elaborator(&theory, toplevel);
                let (_, ty_v) = elab.ty(tn.body);
                let Some(uwd) = record_to_uwd(&ty_v) else {
                    return self.error(tn.loc, "expected a record type");
                };
                let out = uwd.to_doc().0.pretty(77).to_string().replace("\n", "\n#/ ");
                Some(TopElabResult::Output(out))
            }
            "generate" => {
                let theory = self.get_theory(tn.loc)?;
                let mut elab = self.elaborator(&theory, toplevel);
                let (_, ty_v) = elab.ty(tn.body);
                let (model, ns) = Model::from_ty(toplevel, &theory.definition, &ty_v);
                let printer = DblModelPrinter::new().include_summary(true);
                let out = model.to_doc(&printer, &ns).0.pretty(77).to_string();
                let out = out.trim().replace("\n", "\n#/ ");
                Some(TopElabResult::Output(out))
            }
            _ => self.error(tn.loc, "unknown toplevel declaration"),
        }
    }
}

/// Text-based elaborator of types.
pub struct Elaborator<'a> {
    theory: Theory,
    reporter: Reporter,
    toplevel: &'a Toplevel,
    loc: Option<Loc>,
    ctx: Context,
    next_meta: usize,
}

struct ElaboratorCheckpoint {
    loc: Option<Loc>,
    ctx: ContextCheckpoint,
}

declare_error!(ELAB_ERROR, "elab", "an error during elaboration");

impl<'a> Elaborator<'a> {
    /// Constructs a new elaborator.
    pub fn new(theory: Theory, reporter: Reporter, toplevel: &'a Toplevel) -> Self {
        Self {
            theory,
            reporter,
            toplevel,
            loc: None,
            ctx: Context::new(),
            next_meta: 0,
        }
    }

    /// The codomain model of the instance body currently being
    /// elaborated, if any. Its fields are the codomain's generators,
    /// looked up by name by the instance-clause arms.
    fn instance_codomain(&self) -> Option<Rc<RecordV>> {
        self.ctx.codomain.clone()
    }

    fn theory(&self) -> &TheoryDef {
        &self.theory.definition
    }

    fn checkpoint(&self) -> ElaboratorCheckpoint {
        ElaboratorCheckpoint {
            loc: self.loc,
            ctx: self.ctx.checkpoint(),
        }
    }

    fn reset_to(&mut self, c: ElaboratorCheckpoint) {
        self.loc = c.loc;
        self.ctx.reset_to(c.ctx);
    }

    fn enter<'c>(&'c mut self, loc: Loc) -> ScopeGuard<&'c mut Self, impl FnOnce(&'c mut Self)> {
        let c = self.checkpoint();
        self.loc = Some(loc);
        guard(self, |e| {
            e.reset_to(c);
        })
    }

    fn fresh_meta(&mut self) -> MetaVar {
        let i = self.next_meta;
        self.next_meta += 1;
        MetaVar::new(None, i)
    }

    fn error<T>(&self, msg: impl Into<String>) -> Option<T> {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        None
    }

    fn ty_hole(&mut self) -> (TyS, TyV) {
        let ty_m = self.fresh_meta();
        (TyS::meta(ty_m), TyV::meta(ty_m))
    }

    fn ty_error(&mut self, msg: impl Into<String>) -> (TyS, TyV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.ty_hole()
    }

    fn syn_hole(&mut self) -> (TmS, TmV, TyV) {
        let tm_m = self.fresh_meta();
        let ty_m = self.fresh_meta();
        (TmS::meta(tm_m), TmV::meta(tm_m), TyV::meta(ty_m))
    }

    fn syn_error(&mut self, msg: impl Into<String>) -> (TmS, TmV, TyV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.syn_hole()
    }

    fn chk_hole(&mut self) -> (TmS, TmV) {
        let tm_m = self.fresh_meta();
        (TmS::meta(tm_m), TmV::meta(tm_m))
    }

    fn chk_error(&mut self, msg: impl Into<String>) -> (TmS, TmV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.chk_hole()
    }

    fn evaluator(&self) -> Evaluator<'a> {
        Evaluator::new(self.toplevel, self.ctx.env.clone(), self.ctx.scope.len())
    }

    fn intro(&mut self, name: VarName, label: LabelSegment, ty: Option<TyV>) -> TmV {
        let v = TmV::neu(
            TmN::var(self.ctx.scope.len().into(), name, label),
            ty.clone().unwrap_or(TyV::unit()),
        );
        let v = if ty.is_some() {
            self.evaluator().eta(&v, ty.as_ref())
        } else {
            v
        };
        self.ctx.env = self.ctx.env.snoc(v.clone());
        self.ctx.push_scope(name, label, ty);
        v
    }

    /// Apply a codomain morphism `f` to an already-elaborated argument
    /// of fiber type. Shared by the bare `f(x)` and `f(receiver.fld)`
    /// arms of [`Self::syn`].
    fn apply_codomain_morphism(
        &mut self,
        f: &str,
        arg_s: TmS,
        arg_v: TmV,
        arg_ty: TyV,
        arg_label_str: &str,
    ) -> (TmS, TmV, TyV) {
        let Some(codomain) = self.instance_codomain() else {
            return self
                .syn_error("applied codomain morphism is only allowed inside an instance body");
        };
        let TyV_::Over(src_path) = &*arg_ty else {
            let quoted = self.evaluator().quote_ty(&arg_ty);
            return self.syn_error(format!(
                "argument {arg_label_str} has type {quoted}, expected a fiber type",
            ));
        };
        let f_label = label_seg(f);
        let f_name = name_seg(f);
        let Some(mor_ty_s) = codomain.fields.get(f_name) else {
            return self.syn_error(format!("no such codomain morphism {f_name}"));
        };
        let TyS_::Morphism(_, dom_s, cod_s) = &**mor_ty_s else {
            return self.syn_error(format!("codomain field {f_name} is not a morphism"));
        };
        let (Some(dom_path), Some(cod_path)) = (tms_to_path(dom_s), tms_to_path(cod_s)) else {
            return self.syn_error(format!(
                "codomain morphism {f_name} has non-path dom/cod; \
                 applied-morphism syntax requires both to be paths",
            ));
        };
        if dom_path != *src_path {
            return self.syn_error(format!(
                "codomain morphism {f_name} has source path differing from the argument",
            ));
        }
        (
            TmS::over_app(f_name, f_label, cod_path.clone(), arg_s),
            TmV::over_app(f_name, f_label, cod_path.clone(), arg_v),
            TyV::over(cod_path),
        )
    }

    /// Elaborate an instance body — a tuple of `name : type`, `field
    /// := [names]`, and `mor(arg) := target` clauses — against the
    /// enclosing sketch type `codomain`. Produces a [`TmS_::Instance`]
    /// / [`TmV_::Instance`] pair whose payload is the instance's
    /// generator slots, equation witnesses, and sub-instance imports.
    ///
    /// The codomain is set on the context (and restored on exit) so
    /// that generator (fiber) clauses and applied-codomain-morphism
    /// syntax inside the body resolve their generators by name.
    fn instance_body(&mut self, codomain: &RecordV, n: &FNtn) -> (TmS, TmV) {
        let saved = self.ctx.codomain.replace(Rc::new(codomain.clone()));
        let result = self.instance_body_inner(n);
        self.ctx.codomain = saved;
        result
    }

    /// Elaborate the clauses of an instance body (the tuple `n`) into the
    /// payload of an [`InstanceBodyS`]/[`InstanceBodyV`]. The codomain is
    /// already set on the context by [`Self::instance_body`].
    ///
    /// Steps:
    /// 1. Set up empty accumulators (see below) for the clauses to fill.
    /// 2. Walk each clause, dispatching on its surface shape into one of
    ///    the forms below. A malformed clause reports an error and sets
    ///    `failed`, but the walk continues so a single pass surfaces as
    ///    many errors as possible.
    /// 3. If any clause failed, return an empty instance (errors already
    ///    reported); otherwise assemble the accumulators into the paired
    ///    instance terms.
    ///
    /// The clause forms, in match order:
    /// - `name : type` — dispatched on the *elaborated type's* shape: a
    ///   fiber type `Over(p)` declares a generator; a record type is a
    ///   sub-instance import (must name a top-level instance def); an
    ///   identity type `a == b` is an anonymous equation.
    /// - `field := [k := t, ...]` — mapping-literal: sugar for a batch of
    ///   per-key equations `field(k) := t` against a codomain *morphism*.
    /// - `field := [n1, n2, ...]` — set-literal: declares generators in
    ///   the fiber over a codomain *object* `field`.
    /// - `mor(arg) := target` — a single equation witness.
    fn instance_body_inner(&mut self, n: &FNtn) -> (TmS, TmV) {
        let mut elab = self.enter(n.loc());
        let Tuple(field_ns) = n.ast0() else {
            elab.error::<()>("expected a tuple instance body");
            return (
                TmS::instance(InstanceBodyS::default()),
                TmV::instance(InstanceBodyV::default()),
            );
        };
        // Accumulators, assembled into the instance payload at the end:
        // generators (with the codomain fiber path each lives over),
        // equation witnesses (quoted lhs/rhs pairs), and imported
        // sub-instances. `_s`/`_v` hold the syntactic / value forms.
        let mut gens: IndexMap<FieldName, (LabelSegment, Vec<(FieldName, LabelSegment)>)> =
            IndexMap::new();
        let mut eqns_s: Vec<(TmS, TmS)> = Vec::new();
        let mut eqns_v: Vec<(TmV, TmV)> = Vec::new();
        let mut subs_s: IndexMap<FieldName, (LabelSegment, TmS)> = IndexMap::new();
        let mut subs_v: IndexMap<FieldName, (LabelSegment, TmV)> = IndexMap::new();
        let mut failed = false;

        for field_n in field_ns.iter() {
            elab.loc = Some(field_n.loc());
            match field_n.ast0() {
                // `name : type` — generator, sub-instance, or
                // anonymous equation clause (dispatched on the
                // elaborated type's shape).
                App2(L(_, Keyword(":")), L(_, Var(name)), ty_n) => {
                    let name_str = *name;
                    let n_seg = name_seg(name_str);
                    let label = label_seg(name_str);
                    let (_, ty_v) = elab.ty(ty_n);
                    match &*ty_v {
                        TyV_::Over(path) => {
                            gens.insert(n_seg, (label, path.clone()));
                            elab.intro(n_seg, label, Some(ty_v));
                        }
                        TyV_::Record(_) => {
                            let (sub_s, sub_v) = match ty_n.ast0() {
                                Var(sub_name) => {
                                    let topvar = name_seg(*sub_name);
                                    match elab.toplevel.declarations.get(&topvar) {
                                        Some(TopDecl::DefConst(d))
                                            if matches!(&*d.val, TmV_::Instance(_)) =>
                                        {
                                            (d.stx.clone(), d.val.clone())
                                        }
                                        _ => {
                                            elab.error::<()>(format!(
                                                "sub-instance {sub_name} must reference a \
                                                 top-level instance declaration",
                                            ));
                                            failed = true;
                                            continue;
                                        }
                                    }
                                }
                                _ => {
                                    elab.error::<()>(
                                        "sub-instance type must be a top-level def name",
                                    );
                                    failed = true;
                                    continue;
                                }
                            };
                            subs_s.insert(n_seg, (label, sub_s));
                            subs_v.insert(n_seg, (label, sub_v));
                            elab.intro(n_seg, label, Some(ty_v));
                        }
                        TyV_::Id(_, lhs, rhs) => {
                            let evaluator = elab.evaluator();
                            let lhs_s = evaluator.quote_tm(lhs);
                            let rhs_s = evaluator.quote_tm(rhs);
                            eqns_s.push((lhs_s, rhs_s));
                            eqns_v.push((lhs.clone(), rhs.clone()));
                        }
                        _ => {
                            let quoted = elab.evaluator().quote_ty(&ty_v);
                            elab.error::<()>(format!(
                                "instance clause {name_str} has type {quoted}, expected \
                                 an element over an object generator, a sub-sketch, or an equation",
                            ));
                            failed = true;
                        }
                    }
                }
                // `field := [k1 := t1, k2 := t2, ...]` — mapping-literal
                // assignment to a morphism-typed field of the codomain.
                // Equivalent to a sequence of per-entry mapping clauses
                // `field(k1) := t1`, `field(k2) := t2`, ...
                App2(L(_, Keyword(":=")), L(_, Var(field_name)), L(_, Tuple(entries)))
                    if !entries.is_empty()
                        && entries
                            .iter()
                            .all(|e| matches!(e.ast0(), App2(L(_, Keyword(":=")), _, _))) =>
                {
                    let Some(codomain) = elab.instance_codomain() else {
                        elab.error::<()>(
                            "mapping-literal assignment is only allowed inside an instance body",
                        );
                        failed = true;
                        continue;
                    };
                    let f_seg = name_seg(*field_name);
                    let f_label = label_seg(*field_name);
                    let Some(mor_ty_s) = codomain.fields.get(f_seg) else {
                        elab.error::<()>(format!("no such codomain field {field_name}"));
                        failed = true;
                        continue;
                    };
                    let TyS_::Morphism(_, dom_s, cod_s) = &**mor_ty_s else {
                        elab.error::<()>(format!(
                            "mapping-literal assignment requires field {field_name} to be \
                             morphism-typed",
                        ));
                        failed = true;
                        continue;
                    };
                    let (Some(dom_path), Some(cod_path)) = (tms_to_path(dom_s), tms_to_path(cod_s))
                    else {
                        elab.error::<()>(format!(
                            "codomain morphism {field_name} has non-path dom/cod; \
                             mapping-literal assignment requires both to be paths",
                        ));
                        failed = true;
                        continue;
                    };
                    let mut entry_failed = false;
                    for entry_n in entries.iter() {
                        elab.loc = Some(entry_n.loc());
                        let App2(L(_, Keyword(":=")), key_n, target_n) = entry_n.ast0() else {
                            unreachable!("guard ensured all entries are `:=` clauses");
                        };
                        let (key_s, key_v, key_ty) = elab.syn(key_n);
                        let TyV_::Over(key_path) = &*key_ty else {
                            let quoted = elab.evaluator().quote_ty(&key_ty);
                            elab.error::<()>(format!(
                                "mapping-literal key has type {quoted}, expected an element over {}",
                                object_path_str(&dom_path),
                            ));
                            entry_failed = true;
                            break;
                        };
                        if key_path != &dom_path {
                            elab.error::<()>(format!(
                                "mapping-literal key is an element over {}, but {field_name} expects an element over {}",
                                object_path_str(key_path),
                                object_path_str(&dom_path),
                            ));
                            entry_failed = true;
                            break;
                        }
                        let lhs_ty = TyV::over(cod_path.clone());
                        let lhs_s = TmS::over_app(f_seg, f_label, cod_path.clone(), key_s);
                        let lhs_v = TmV::over_app(f_seg, f_label, cod_path.clone(), key_v);
                        let (rhs_s, rhs_v) = elab.chk(&lhs_ty, target_n);
                        eqns_s.push((lhs_s, rhs_s));
                        eqns_v.push((lhs_v, rhs_v));
                    }
                    if entry_failed {
                        failed = true;
                        continue;
                    }
                }
                // `field := [n1, n2, ...]` — set-literal assignment to
                // an object-typed field of the codomain.
                App2(L(_, Keyword(":=")), L(_, Var(field_name)), L(_, Tuple(name_ns))) => {
                    let Some(codomain) = elab.instance_codomain() else {
                        elab.error::<()>(
                            "set-literal field assignment is only allowed inside an \
                             instance body",
                        );
                        failed = true;
                        continue;
                    };
                    let f_seg = name_seg(*field_name);
                    let f_label = label_seg(*field_name);
                    let Some(field_ty_s) = codomain.fields.get(f_seg) else {
                        elab.error::<()>(format!("no such codomain field {field_name}"));
                        failed = true;
                        continue;
                    };
                    if !matches!(&**field_ty_s, TyS_::Object(_)) {
                        elab.error::<()>(format!(
                            "set-literal assignment requires field {field_name} to be \
                             object-typed",
                        ));
                        failed = true;
                        continue;
                    }
                    let path = vec![(f_seg, f_label)];
                    let gen_ty = TyV::over(path.clone());
                    for name_n in name_ns.iter() {
                        let Var(gen_name) = name_n.ast0() else {
                            elab.loc = Some(name_n.loc());
                            elab.error::<()>("set-literal entries must be bare names");
                            failed = true;
                            break;
                        };
                        let gen_seg = name_seg(*gen_name);
                        let gen_label = label_seg(*gen_name);
                        gens.insert(gen_seg, (gen_label, path.clone()));
                        elab.intro(gen_seg, gen_label, Some(gen_ty.clone()));
                    }
                }
                // `mor(arg) := target` — mapping-entry clause:
                // an equation witness.
                App2(L(_, Keyword(":=")), lhs_n, rhs_n) => {
                    let (lhs_s, lhs_v, lhs_ty) = elab.syn(lhs_n);
                    if !matches!(&*lhs_ty, TyV_::Morphism(_, _, _) | TyV_::Over(_)) {
                        elab.loc = Some(lhs_n.loc());
                        elab.error::<()>(
                            "mapping-entry clause `mor(arg) := target` requires the LHS \
                             to be a morphism or an element over an object",
                        );
                        failed = true;
                        continue;
                    }
                    let (rhs_s, rhs_v) = elab.chk(&lhs_ty, rhs_n);
                    eqns_s.push((lhs_s, rhs_s));
                    eqns_v.push((lhs_v, rhs_v));
                }
                _ => {
                    elab.error::<()>(
                        "expected fields in the form `name : type`, \
                         `field := [names]`, or `mor(arg) := target`",
                    );
                    failed = true;
                }
            }
        }

        // Assemble the accumulators into the instance payload, unless a
        // clause failed — then errors are already reported, so bail with
        // an empty instance rather than a half-built one.
        if failed {
            return (
                TmS::instance(InstanceBodyS::default()),
                TmV::instance(InstanceBodyV::default()),
            );
        }
        let body_s = InstanceBodyS {
            generators: gens.clone(),
            equations: eqns_s,
            sub_instances: subs_s,
        };
        let body_v = InstanceBodyV {
            generators: gens,
            equations: eqns_v,
            sub_instances: subs_v,
        };
        (TmS::instance(body_s), TmV::instance(body_v))
    }

    fn binding(&mut self, n: &FNtn) -> Option<(VarName, LabelSegment, TyS, TyV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            App2(L(_, Keyword(":")), L(_, Var(name)), ty_n) => {
                let (ty_s, ty_v) = elab.ty(ty_n);
                Some((name_seg(*name), label_seg(*name), ty_s, ty_v))
            }
            _ => elab.error("unexpected notation for binding"),
        }
    }

    fn lookup_ty(&mut self, name: VarName) -> (TyS, TyV) {
        let qname = QualifiedName::single(name);
        if let Some(ob_type) = self.theory().basic_ob_type(qname) {
            (TyS::object(ob_type.clone()), TyV::object(ob_type))
        } else if let Some(d) = self.toplevel.declarations.get(&name) {
            match d {
                TopDecl::Type(t) => {
                    if t.theory == self.theory {
                        (TyS::topvar(name), t.val.clone())
                    } else {
                        self.ty_error(format!(
                            "{name} refers to a type in theory {}, expected a type in theory {}",
                            t.theory, self.theory
                        ))
                    }
                }
                // An instance term used in type position yields the record
                // type synthesized from its body, allowing sub-instance
                // imports (`we : Edge`) to project into Edge's fields.
                TopDecl::DefConst(d) if matches!(&*d.val, TmV_::Instance(_)) => {
                    if d.theory == self.theory {
                        let TmV_::Instance(body) = &*d.val else {
                            unreachable!("guarded by the match arm above")
                        };
                        let body_ty = self.evaluator().synth_instance_body_ty(body);
                        (TyS::topvar(name), body_ty)
                    } else {
                        self.ty_error(format!(
                            "{name} refers to an instance in theory {}, expected theory {}",
                            d.theory, self.theory
                        ))
                    }
                }
                TopDecl::Def(_) | TopDecl::DefConst(_) => {
                    self.ty_error(format!("{name} refers to a term not a type"))
                }
            }
        } else {
            self.ty_error(format!("no such type {name} defined"))
        }
    }
    fn morphism_ty(&mut self, n: &FNtn) -> Option<(MorType, ObType, ObType)> {
        let elab = self.enter(n.loc());
        let theory = elab.theory();
        match n.ast0() {
            App1(L(_, Keyword("Hom")), L(_, Var(name))) => {
                let qname = QualifiedName::single(name_seg(*name));
                if let Some(ob_type) = theory.basic_ob_type(qname) {
                    if let Some(hom_type) = theory.hom_type(ob_type.clone()) {
                        Some((hom_type, ob_type.clone(), ob_type))
                    } else {
                        elab.error(format!("object type {name} does not have hom type"))
                    }
                } else {
                    elab.error(format!("no such object type {name}"))
                }
            }
            Var(name) => {
                let qname = QualifiedName::single(name_seg(*name));
                if let Some(mor_type) = theory.basic_mor_type(qname) {
                    let dom = theory.src_type(&mor_type);
                    let cod = theory.tgt_type(&mor_type);
                    Some((mor_type, dom, cod))
                } else {
                    elab.error(format!("no such morphism type {name}"))
                }
            }
            _ => elab.error("unexpected notation for morphism type"),
        }
    }

    fn path(&mut self, n: &FNtn) -> Option<Vec<(NameSegment, LabelSegment)>> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Field(f) => Some(vec![(name_seg(*f), label_seg(*f))]),
            App1(p_n, L(_, Field(f))) => {
                let mut p = elab.path(p_n)?;
                p.push((name_seg(*f), label_seg(*f)));
                Some(p)
            }
            _ => elab.error("unexpected notation for path"),
        }
    }

    #[allow(clippy::type_complexity)]
    fn specialization(&mut self, n: &FNtn) -> Option<(Vec<(NameSegment, LabelSegment)>, TyS, TyV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            App2(L(_, Keyword(":")), p_n, ty_n) => {
                let p = elab.path(p_n)?;
                let (ty_s, ty_v) = elab.ty(ty_n);
                Some((p, ty_s, ty_v))
            }
            App2(L(_, Keyword(":=")), p_n, tm_n) => {
                let p = elab.path(p_n)?;
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n);
                Some((p, TyS::sing(elab.evaluator().quote_ty(&ty_v), tm_s), TyV::sing(ty_v, tm_v)))
            }
            _ => elab.error("unexpected notation for specialization"),
        }
    }

    /// Elaborates a type from notation, returning both syntax and value.
    pub fn ty(&mut self, n: &FNtn) -> (TyS, TyV) {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => elab.lookup_ty(name_seg(*name)),
            Keyword("Unit") => (TyS::unit(), TyV::unit()),
            App1(L(_, Prim("sing")), tm_n) => {
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n);
                (TyS::sing(elab.evaluator().quote_ty(&ty_v), tm_s), TyV::sing(ty_v, tm_v))
            }
            App1(mt_n, L(_, Tuple(domcod_n))) => {
                let [dom_n, cod_n] = domcod_n.as_slice() else {
                    return elab.ty_error("expected two arguments for morphism type");
                };
                let Some((mt, dom_ty, cod_ty)) = elab.morphism_ty(mt_n) else {
                    return elab.ty_hole();
                };
                let (dom_s, dom_v) = elab.chk(&TyV::object(dom_ty.clone()), dom_n);
                let (cod_s, cod_v) = elab.chk(&TyV::object(cod_ty.clone()), cod_n);
                (TyS::morphism(mt.clone(), dom_s, cod_s), TyV::morphism(mt.clone(), dom_v, cod_v))
            }
            Tuple(field_ns) => {
                let mut field_ty_vs = Vec::<(FieldName, (LabelSegment, TyV))>::new();
                let mut failed = false;
                let self_var = elab.intro(name_seg("self"), label_seg("self"), None).unwrap_neu();
                let c = elab.checkpoint();
                for field_n in field_ns.iter() {
                    elab.loc = Some(field_n.loc());
                    let Some((name, label, ty_n)) = (match field_n.ast0() {
                        App2(L(_, Keyword(":")), L(_, Var(name)), ty_n) => {
                            let name_seg = name_seg(*name);
                            Some((name_seg, label_seg(*name), ty_n))
                        }
                        _ => elab.error("expected fields in the form <name> : <type>"),
                    }) else {
                        failed = true;
                        continue;
                    };
                    let (_, ty_v) = elab.ty(ty_n);
                    field_ty_vs.push((name, (label, ty_v.clone())));
                    elab.ctx.push_scope(name, label, Some(ty_v.clone()));
                    elab.ctx.env =
                        elab.ctx.env.snoc(TmV::neu(TmN::proj(self_var.clone(), name, label), ty_v));
                }
                if failed {
                    return elab.ty_hole();
                }
                elab.reset_to(c);
                let field_tys: Row<_> = field_ty_vs
                    .iter()
                    .map(|(name, (label, ty_v))| (*name, (*label, elab.evaluator().quote_ty(ty_v))))
                    .collect();
                let r_v = RecordV::new(elab.ctx.env.clone(), field_tys.clone(), Dtry::empty());
                (TyS::record(field_tys), TyV::record(r_v))
            }
            App2(L(_, Keyword("&")), ty_n, L(_, Tuple(specialization_ns))) => {
                let (ty_s, mut ty_v) = elab.ty(ty_n);
                let mut specializations = Vec::new();
                // Approach:
                //
                // 1. Write a try_specialize method which attempts to specialize ty_v
                // with a given path + type (e.g. `.x.y : @sing a`), returning a new
                // type or an error message.
                // 2. Iteratively apply try_specialize to each specialization in turn.
                for specialization_n in specialization_ns.iter() {
                    elab.loc = Some(specialization_n.loc());
                    let Some((path, sty_s, sty_v)) = elab.specialization(specialization_n) else {
                        return elab.ty_hole();
                    };
                    match elab.evaluator().try_specialize(&ty_v, &path, sty_v) {
                        Ok(specialized) => {
                            ty_v = specialized;
                            specializations.push((path, sty_s));
                        }
                        Err(s) => {
                            return elab
                                .ty_error(format!("Failed to specialize:\n... because {s}"));
                        }
                    }
                }
                (TyS::specialize(ty_s, specializations), ty_v)
            }
            App2(L(_, Keyword("==")), tm1_n, tm2_n) => {
                let (tm1_s, tm1_v, tm1_ty) = elab.syn(tm1_n);
                let (tm2_s, tm2_v, tm2_ty) = elab.syn(tm2_n);
                if !matches!(&*tm1_ty, TyV_::Morphism(_, _, _) | TyV_::Over(_)) {
                    elab.loc = Some(tm1_n.loc());
                    return elab
                        .ty_error(
                            "Equality types are only supported for morphisms and elements over an object",
                        );
                }
                if let Err(e) = elab.evaluator().convertible_ty(&tm1_ty, &tm2_ty) {
                    let eval = elab.evaluator();
                    return elab.ty_error(format!(
                        "types {} and {} are not convertible:\n{}",
                        eval.quote_ty(&tm1_ty),
                        eval.quote_ty(&tm2_ty),
                        e.pretty()
                    ));
                }
                let eq_ty_s = TyS::id(elab.evaluator().quote_ty(&tm1_ty), tm1_s, tm2_s);
                let eq_ty_v = TyV::id(tm1_ty, tm1_v, tm2_v);
                (eq_ty_s, eq_ty_v)
            }
            _ => elab.ty_error("unexpected notation for type"),
        }
    }

    fn lookup_tm(&mut self, name: Ustr) -> (TmS, TmV, TyV) {
        let label = label_seg(name);
        let name = name_seg(name);
        if let Some((i, _, ty)) = self.ctx.lookup(name) {
            (
                TmS::var(i, name, label),
                self.ctx.env.get(*i).unwrap().clone(),
                ty.clone().unwrap(),
            )
        } else if let Some(d) = self.toplevel.lookup(name) {
            match d {
                TopDecl::Type(_) => self.syn_error(format!("{name} refers type, not term")),
                // An instance is just a term (its `val` is a `TmV_::Instance`),
                // so it resolves here like any other constant.
                TopDecl::DefConst(d) => (TmS::topvar(name), d.val.clone(), d.ty.clone()),
                TopDecl::Def(_) => self.syn_error(format!("{name} must be applied to arguments")),
            }
        } else {
            self.syn_error(format!("no such variable {name}"))
        }
    }

    /// Elaborates a term from notation, returning syntax, value, and synthesized type.
    fn syn(&mut self, n: &FNtn) -> (TmS, TmV, TyV) {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => elab.lookup_tm(ustr(name)),
            App1(tm_n, L(_, Field(f))) => {
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n);
                let TyV_::Record(r) = &*ty_v else {
                    return elab.syn_error("can only project from record type");
                };
                let label = label_seg(*f);
                let f = name_seg(*f);
                if !r.fields.has(f) {
                    return elab.syn_error(format!("no such field {f}"));
                }
                (
                    TmS::proj(tm_s, f, label),
                    elab.evaluator().proj(&tm_v, f, label),
                    elab.evaluator().field_ty(&ty_v, &tm_v, f),
                )
            }
            // Applied codomain-morphism syntax. Two shapes:
            //
            //   `f(x)`            — `x` is a variable of fiber type in
            //                       scope.
            //   `f(receiver.fld)` — argument is a record projection
            //                       (e.g. `src(we.e)`).
            //
            // Both elaborate to a [`TmS_::OverApp`] applying `f` (a
            // codomain morphism in the enclosing instance) to the
            // resolved argument term.
            App1(L(_, Var(f)), L(_, Var(x))) => {
                let (inner_s, inner_v, inner_ty) = elab.lookup_tm(ustr(x));
                elab.apply_codomain_morphism(f, inner_s, inner_v, inner_ty, x)
            }
            App1(L(_, Var(f)), L(_, App1(recv_n, L(_, Field(arg_field))))) => {
                let (recv_s, recv_v, recv_ty) = elab.syn(recv_n);
                let TyV_::Record(r) = &*recv_ty else {
                    return elab.syn_error("can only project from record type");
                };
                let arg_name = name_seg(*arg_field);
                let arg_label = label_seg(*arg_field);
                if !r.fields.has(arg_name) {
                    return elab.syn_error(format!("no such field {arg_name}"));
                }
                let arg_ty = elab.evaluator().field_ty(&recv_ty, &recv_v, arg_name);
                let arg_s = TmS::proj(recv_s, arg_name, arg_label);
                let arg_v = elab.evaluator().proj(&recv_v, arg_name, arg_label);
                elab.apply_codomain_morphism(f, arg_s, arg_v, arg_ty, arg_field)
            }
            App1(L(_, Prim("id")), ob_n) => {
                let (ob_s, ob_v, ob_t) = elab.syn(ob_n);
                let TyV_::Object(ob_type) = &*ob_t else {
                    return elab.syn_error("can only apply @id to objects");
                };
                let Some(mor_type) = elab.theory().hom_type(ob_type.clone()) else {
                    return elab.syn_error("object type does not have a hom type");
                };
                (
                    TmS::id(ob_s),
                    TmV::id(ob_v.clone()),
                    TyV::morphism(mor_type, ob_v.clone(), ob_v),
                )
            }
            App1(L(_, Prim("tab")), mor_n) => {
                let (mor_s, mor_v, mor_t) = elab.syn(mor_n);
                let TyV_::Morphism(mor_type, _, _) = &*mor_t else {
                    return elab.syn_error("can only apply @tab to morphisms");
                };
                let Some(ob_type) = elab.theory().tabulator(mor_type.clone()) else {
                    return elab.syn_error("theory does not have tabulators");
                };
                (TmS::tab(mor_s), TmV::tab(mor_v.clone()), TyV::object(ob_type))
            }
            App1(L(_, Prim(name)), ob_n) => {
                let name = name_seg(*name);
                let Some(ob_op) = elab.theory().basic_ob_op([name].into()) else {
                    let th_name = elab.theory.name.to_string();
                    return elab.syn_error(format!("operation @{name} not in theory {th_name}"));
                };
                let dom = elab.theory().ob_op_dom(&ob_op);
                let (arg_s, arg_v) = elab.chk(&TyV::object(dom), ob_n);
                let cod = elab.theory().ob_op_cod(&ob_op);
                (TmS::ob_app(name, arg_s), TmV::app(name, arg_v), TyV::object(cod))
            }
            App2(L(_, Keyword("*")), f_n, g_n) => {
                let (f_s, f_v, f_ty) = elab.syn(f_n);
                let (g_s, g_v, g_ty) = elab.syn(g_n);
                let TyV_::Morphism(f_mt, f_dom, f_cod) = &*f_ty else {
                    elab.loc = Some(f_n.loc());
                    return elab.syn_error("expected a morphism");
                };
                let TyV_::Morphism(g_mt, g_dom, g_cod) = &*g_ty else {
                    elab.loc = Some(g_n.loc());
                    return elab.syn_error("expected a morphism");
                };
                let theory = elab.theory();
                if theory.tgt_type(f_mt) != theory.src_type(g_mt) {
                    return elab.syn_error("incompatible morphism types");
                }
                if let Err(s) = elab.evaluator().equal_tm(f_cod, g_dom) {
                    let f_cod_s = elab.evaluator().quote_tm(f_cod);
                    let g_dom_s = elab.evaluator().quote_tm(g_dom);
                    return elab.syn_error(format!(
                        "codomain {} and domain {} not equal:\n...because {}",
                        f_cod_s,
                        g_dom_s,
                        s.pretty(),
                    ));
                }
                (
                    TmS::compose(f_s, g_s),
                    TmV::compose(f_v, g_v),
                    TyV::morphism(
                        elab.theory().compose_types2(f_mt.clone(), g_mt.clone()).unwrap(),
                        f_dom.clone(),
                        g_cod.clone(),
                    ),
                )
            }
            App1(L(_, Var(tv)), L(_, Tuple(args_n))) => {
                let tv = name_seg(*tv);
                let Some(TopDecl::Def(d)) = elab.toplevel.lookup(tv) else {
                    return elab.syn_error(format!("no such toplevel def {tv}"));
                };
                let mut arg_stxs = Vec::new();
                let mut env = Env::nil();
                if args_n.len() != d.args.len() {
                    return elab.syn_error(format!(
                        "wrong number of args for {tv}, expected {}, got {}",
                        d.args.len(),
                        args_n.len()
                    ));
                }
                for (arg_n, (_, (_, arg_ty_s))) in args_n.iter().zip(d.args.iter()) {
                    let arg_ty_v = elab.evaluator().with_env(env.clone()).eval_ty(arg_ty_s);
                    let (arg_s, arg_v) = elab.chk(&arg_ty_v, arg_n);
                    arg_stxs.push(arg_s);
                    env = env.snoc(arg_v);
                }
                let eval = elab.evaluator().with_env(env.clone());
                (TmS::topapp(tv, arg_stxs), eval.eval_tm(&d.body), eval.eval_ty(&d.ret_ty))
            }
            Tag("tt") => (TmS::tt(), TmV::tt(), TyV::unit()),
            Tuple(_) => elab.syn_error("must check against a type in order to construct a record"),
            Prim("hole") => elab.syn_error("explicit hole"),
            _ => elab.syn_error("unexpected notation for term"),
        }
    }

    /// Elaborates a term from notation, checking against an expected type, and returning syntax and value.
    fn chk(&mut self, ty: &TyV, n: &FNtn) -> (TmS, TmV) {
        let mut elab = self.enter(n.loc());
        match (&**ty, n.ast0()) {
            (TyV_::Record(r), Tuple(field_ns)) => {
                // Dispatch by clause shape. An instance body has at
                // least one clause that doesn't fit the
                // `field := value` record-construction shape — either a
                // `:`-typed slot, a `mor(arg) := target` mapping entry
                // (LHS is an application), a `field := [names]`
                // set-literal assignment (RHS is a tuple of bare names),
                // or a `field := [key := target, ...]` mapping-literal
                // assignment (RHS is a tuple of `:=`-clauses). The
                // remaining `field := value` shape — and a tuple of
                // `:=`-clauses where each LHS matches an inner field of
                // a nested record type — is ordinary record construction.
                if field_ns.iter().any(|f| match f.ast0() {
                    App2(L(_, Keyword(":")), _, _) => true,
                    App2(L(_, Keyword(":=")), L(_, App1(_, _)), _) => true,
                    App2(L(_, Keyword(":=")), L(_, Var(_)), L(_, Tuple(elems))) => {
                        // Set-literal: tuple of bare names.
                        elems.iter().all(|e| matches!(e.ast0(), Var(_)))
                    }
                    _ => false,
                }) {
                    return elab.instance_body(r, n);
                }
                // Mapping-literal disambiguation: `field := [k := v, ...]`
                // where the LHS field is a *morphism* of the enclosing
                // record (sketch). If the field is object- or
                // record-typed, treat as nested record construction
                // instead — this distinction can only be made by
                // consulting the record's field type.
                if field_ns.iter().any(|f| {
                    let App2(L(_, Keyword(":=")), L(_, Var(field_name)), L(_, Tuple(elems))) =
                        f.ast0()
                    else {
                        return false;
                    };
                    if !elems.iter().all(|e| matches!(e.ast0(), App2(L(_, Keyword(":=")), _, _))) {
                        return false;
                    }
                    let Some(field_ty_s) = r.fields.get(name_seg(*field_name)) else {
                        return false;
                    };
                    matches!(&**field_ty_s, TyS_::Morphism(_, _, _))
                }) {
                    return elab.instance_body(r, n);
                }
                if r.fields.len() != field_ns.len() {
                    return elab.chk_error(format!(
                        "wrong number of fields provided, expected {}, got {}",
                        r.fields.len(),
                        field_ns.len(),
                    ));
                }
                let mut field_stxs = IndexMap::new();
                let mut field_vals = IndexMap::new();
                for (field_n, (name, (label, field_ty_s))) in field_ns.iter().zip(r.fields.iter()) {
                    elab.loc = Some(field_n.loc());
                    let tm_n = match field_n.ast0() {
                        App2(L(_, Keyword(":=")), L(_, Var(given_name)), field_val_n) => {
                            if name_seg(*given_name) == *name {
                                field_val_n
                            } else {
                                return elab.chk_error(format!("unexpected field {given_name}"));
                            }
                        }
                        _ => {
                            return elab.chk_error("unexpected notation for field");
                        }
                    };
                    let v = TmV::cons(field_vals.clone().into());
                    let field_ty_v =
                        elab.evaluator().with_env(r.env.snoc(v.clone())).eval_ty(field_ty_s);
                    let (tm_s, tm_v) = elab.chk(&field_ty_v, tm_n);
                    field_stxs.insert(*name, (*label, tm_s));
                    field_vals.insert(*name, (*label, tm_v));
                }
                (TmS::cons(field_stxs.into()), TmV::cons(field_vals.into()))
            }
            (TyV_::Object(ob_type), Tuple(ob_ns)) => {
                let Some(ob_type) = ob_type.clone().list_arg() else {
                    return elab.chk_error("expected to object type to be a list");
                };
                let elem_ty_v = TyV::object(ob_type);
                let mut elem_stxs = Vec::new();
                let mut elem_vals = Vec::new();
                for ob_n in ob_ns {
                    elab.loc = Some(ob_n.loc());
                    let (tm_s, tm_v) = elab.chk(&elem_ty_v, ob_n);
                    elem_stxs.push(tm_s);
                    elem_vals.push(tm_v);
                }
                (TmS::list(elem_stxs), TmV::list(elem_vals))
            }
            (_, Tuple(_)) => elab.chk_error("tuple expected to be record or object/morphism type"),
            (_, Prim("hole")) => elab.chk_error("explicit hole"),
            _ => {
                let (tm_s, tm_v, synthed) = elab.syn(n);
                let eval = elab.evaluator();
                if let Err(e) = eval.convertible_ty(&synthed, ty) {
                    return elab.chk_error(format!(
                        "synthesized type {} does not match expected type {}:\n{}",
                        eval.quote_ty(&synthed),
                        eval.quote_ty(ty),
                        e.pretty()
                    ));
                }
                if let Err(e) = eval.element_of(&tm_v, ty) {
                    return elab.chk_error(format!(
                        "evaluated term {} is not an element of specialized type {}:\n{}",
                        eval.quote_tm(&tm_v),
                        eval.quote_ty(ty),
                        e.pretty()
                    ));
                }
                (tm_s, tm_v)
            }
        }
    }
}

/// Read off a path of `(name, label)` segments from a term that is a chain
/// of projections rooted in a variable.
///
/// The leading variable is treated as the implicit root (e.g., the `self`
/// of an enclosing record) and contributes no segment. So `Var(self)`
/// returns `[]` and `Proj(Var(self), E, E_label)` returns `[(E, E_label)]`,
/// matching the path representation produced by the surface `.E` syntax.
/// Returns `None` if the term has any other shape.
/// Render an object path (e.g. `[(V, V)]`) as a dotted label string
/// (e.g. `V`, or `we.E` for a nested path) for use in error messages.
fn object_path_str(path: &[(FieldName, LabelSegment)]) -> String {
    path.iter().map(|(_, seg)| seg.to_string()).collect::<Vec<_>>().join(".")
}

fn tms_to_path(tm: &TmS) -> Option<Vec<(NameSegment, LabelSegment)>> {
    match &**tm {
        TmS_::Var(_, _, _) => Some(vec![]),
        TmS_::Proj(inner, name, label) => {
            let mut p = tms_to_path(inner)?;
            p.push((*name, *label));
            Some(p)
        }
        _ => None,
    }
}

// NOTE: Most tests for the text elaborator are in the `examples` dir.
#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use crate::stdlib;
    use crate::tt::modelgen::Model;

    #[test]
    fn generate_model_from_text() {
        let th = Rc::new(stdlib::th_signed_category());
        let source = "[
            x : Object,
            loop : Negative[x, x]
        ]";
        let model = Model::from_text(&th.clone().into(), source).unwrap();
        let model = model.as_discrete().unwrap();
        assert_eq!(model, stdlib::models::negative_loop(th));
    }

    /// Check that a commutative square really produces a model with exactly one equation.
    #[test]
    fn generate_model_with_eqn() {
        let th = Rc::new(stdlib::th_schema()).into();
        let source = "[
            NW : Entity,
            NE : Entity,
            SW : Entity,
            SE : Entity,
            t : (Hom Entity)[NW,NE],
            l : (Hom Entity)[NW,SW],
            r : (Hom Entity)[NE,SE],
            b : (Hom Entity)[SW, SE],
            comm : (t * r == l * b)
        ]";
        let model = Model::from_text(&th, source).unwrap().as_discrete().unwrap();
        let eqns: Vec<_> = model.category.equations().collect();
        assert_eq!(eqns.len(), 1);
    }

    #[test]
    fn text_error_reporting() {
        let th = Rc::new(stdlib::th_schema()).into();

        let result = Model::from_text(&th, "[ : Entit]");
        let expected = expect![[r#"
            error[elab]: expected fields in the form <name> : <type>
            --> <none>:1:3
            1| [ : Entit]
            1|   ^^^^^^^
        "#]];
        expected.assert_eq(&result.err().unwrap());

        let result = Model::from_text(&th, "[x : Entity, f : Hom(Entit)[x,x]]");
        let expected = expect![[r#"
            error[elab]: no such object type Entit
            --> <none>:1:18
            1| [x : Entity, f : Hom(Entit)[x,x]]
            1|                  ^^^^^^^^^^
        "#]];
        expected.assert_eq(&result.err().unwrap());

        let result = Model::from_text(&th, "[x : Entity, f : Hom(Entity)[x,y]]");
        let expected = expect![[r#"
            error[elab]: no such variable y
            --> <none>:1:32
            1| [x : Entity, f : Hom(Entity)[x,y]]
            1|                                ^
            error[elab]: synthesized type ?1 does not match expected type Entity:
            tried to convert between types of different type constructors
            --> <none>:1:32
            1| [x : Entity, f : Hom(Entity)[x,y]]
            1|                                ^
        "#]];
        expected.assert_eq(&result.err().unwrap());
    }
}
