//! Elaboration for doublett
use crate::{
    dbl::{
        category::VDblCategory,
        theory::{DblTheory, DiscreteDblTheory},
    },
    zero::name,
};
use fnotation::*;
use nonempty::nonempty;
use scopeguard::{ScopeGuard, guard};
use std::fmt::Write;

use tattle::declare_error;

use crate::{
    tt::{context::*, eval::*, modelgen::*, prelude::*, stx::*, toplevel::*, val::*},
    zero::QualifiedName,
};

/// The result of elaborating a top-level statement.
pub enum TopElabResult {
    /// A new declaration
    Declaration(TopVarName, TopDecl),
    /// Output that should be logged
    Output(String),
}

/// Context for top-level elaboration
///
/// Top-level elaboration is elaboration of declarations.
pub struct TopElaborator {
    current_theory: Option<Theory>,
    reporter: Reporter,
}

impl TopElaborator {
    /// Constructor
    pub fn new(reporter: Reporter) -> Self {
        Self {
            current_theory: None,
            reporter,
        }
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

    /// Elaborate a single top-level declaration
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
                        let (_, ty_v) = elab.ty(ty_n);
                        let (tm_s, tm_v) = elab.chk(&ty_v, tm_n);
                        Some(TopElabResult::Declaration(
                            name,
                            TopDecl::DefConst(DefConst::new(theory.clone(), tm_s, tm_v, ty_v)),
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
                Some(TopElabResult::Output(format!("{}", eval.quote_tm(&eval.eta(&tm_v, &ty_v)),)))
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
            "generate" => {
                let theory = self.get_theory(tn.loc)?;
                let mut elab = self.elaborator(&theory, toplevel);
                let (_, ty_v) = elab.ty(tn.body);
                let (model, name_translation) = generate(toplevel, &theory, &ty_v);
                let mut out = String::new();
                writeln!(&mut out).unwrap();
                model_output("#/ ", &mut out, &model, &name_translation).unwrap();
                Some(TopElabResult::Output(out))
            }
            _ => self.error(tn.loc, "unknown toplevel declaration"),
        }
    }
}

struct Elaborator<'a> {
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
    fn new(theory: Theory, reporter: Reporter, toplevel: &'a Toplevel) -> Self {
        Self {
            theory,
            reporter,
            toplevel,
            loc: None,
            ctx: Context::new(),
            next_meta: 0,
        }
    }

    fn dbl_theory(&self) -> &DiscreteDblTheory {
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
        (TmS::meta(tm_m), TmV::Meta(tm_m), TyV::meta(ty_m))
    }

    fn syn_error(&mut self, msg: impl Into<String>) -> (TmS, TmV, TyV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.syn_hole()
    }

    fn chk_hole(&mut self) -> (TmS, TmV) {
        let tm_m = self.fresh_meta();
        (TmS::meta(tm_m), TmV::Meta(tm_m))
    }

    fn chk_error(&mut self, msg: impl Into<String>) -> (TmS, TmV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.chk_hole()
    }

    fn evaluator(&self) -> Evaluator<'a> {
        Evaluator::new(self.toplevel, self.ctx.env.clone(), self.ctx.scope.len())
    }

    fn intro(&mut self, name: VarName, label: LabelSegment, ty: Option<TyV>) -> TmV {
        let v = TmV::Neu(
            TmN::var(self.ctx.scope.len().into(), name, label),
            ty.clone().unwrap_or(TyV::unit()),
        );
        let v = if let Some(ty) = &ty {
            self.evaluator().eta(&v, ty)
        } else {
            v
        };
        self.ctx.env = self.ctx.env.snoc(v.clone());
        self.ctx.push_scope(name, label, ty);
        v
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
        if self.dbl_theory().has_ob(&qname) {
            (TyS::object(qname.clone()), TyV::object(qname))
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
                TopDecl::Def(_) | TopDecl::DefConst(_) => {
                    self.ty_error(format!("{name} refers to a term not a type"))
                }
            }
        } else {
            self.ty_error(format!("no such type {name} defined"))
        }
    }

    fn morphism_ty(&mut self, n: &FNtn) -> Option<(MorphismType, ObjectType, ObjectType)> {
        let elab = self.enter(n.loc());
        match n.ast0() {
            App1(L(_, Keyword("Id")), L(_, Var(name))) => {
                let qname = QualifiedName::single(name_seg(*name));
                if elab.dbl_theory().has_ob(&qname) {
                    Some((MorphismType(Path::Id(qname.clone())), qname.clone(), qname))
                } else {
                    elab.error(format!("no such object type {name}"))
                }
            }
            Var(name) => {
                let qname = QualifiedName::single(name_seg(*name));
                let mt = Path::single(qname);
                let theory = elab.dbl_theory();
                if theory.has_proarrow(&mt) {
                    let dom = theory.src(&mt);
                    let cod = theory.tgt(&mt);
                    Some((MorphismType(mt), dom, cod))
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

    fn ty(&mut self, n: &FNtn) -> (TyS, TyV) {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => elab.lookup_ty(name_seg(*name)),
            Keyword("Unit") => (TyS::unit(), TyV::unit()),
            App1(L(_, Prim("sing")), tm_n) => {
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n);
                (TyS::sing(elab.evaluator().quote_ty(&ty_v), tm_s), TyV::sing(ty_v, tm_v))
            }
            App1(mt_n, L(_, Tuple(domcod_n))) => {
                if domcod_n.len() != 2 {
                    return elab.ty_error("expected two arguments for morphism type");
                }
                let Some((mt, dom_ty, cod_ty)) = elab.morphism_ty(mt_n) else {
                    return elab.ty_hole();
                };
                let (dom_s, dom_v) = elab.chk(&TyV::object(dom_ty.clone()), domcod_n[0]);
                let (cod_s, cod_v) = elab.chk(&TyV::object(cod_ty.clone()), domcod_n[1]);
                (TyS::morphism(mt.clone(), dom_s, cod_s), TyV::morphism(mt.clone(), dom_v, cod_v))
            }
            Tuple(field_ns) => {
                let mut field_ty0s = Vec::<(FieldName, (LabelSegment, Ty0))>::new();
                let mut field_ty_vs = Vec::<(FieldName, (LabelSegment, TyV))>::new();
                let mut failed = false;
                let self_var = elab.intro(name_seg("self"), label_seg("self"), None).as_neu();
                let c = elab.checkpoint();
                for field_n in field_ns.iter() {
                    elab.loc = Some(field_n.loc());
                    let Some((name, label, ty_n)) = (match field_n.ast0() {
                        App2(L(_, Keyword(":")), L(_, Var(name)), ty_n) => {
                            Some((name_seg(*name), label_seg(*name), ty_n))
                        }
                        _ => elab.error("expected fields in the form <name> : <type>"),
                    }) else {
                        println!("failed");
                        failed = true;
                        continue;
                    };
                    let (_, ty_v) = elab.ty(ty_n);
                    field_ty0s.push((name, (label, ty_v.ty0())));
                    field_ty_vs.push((name, (label, ty_v.clone())));
                    elab.ctx.push_scope(name, label, Some(ty_v.clone()));
                    elab.ctx.env =
                        elab.ctx.env.snoc(TmV::Neu(TmN::proj(self_var.clone(), name, label), ty_v));
                }
                if failed {
                    return elab.ty_hole();
                }
                elab.reset_to(c);
                let field_tys: Row<_> = field_ty_vs
                    .iter()
                    .map(|(name, (label, ty_v))| (*name, (*label, elab.evaluator().quote_ty(ty_v))))
                    .collect();
                let field_ty0s: Row<_> = field_ty0s.into_iter().collect();
                let r_s = RecordS::new(field_ty0s.clone(), field_tys.clone());
                let r_v = RecordV::new(field_ty0s, elab.ctx.env.clone(), field_tys, Dtry::empty());
                (TyS::record(r_s), TyV::record(r_v))
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
                TopDecl::DefConst(d) => (TmS::topvar(name), d.val.clone(), d.ty.clone()),
                TopDecl::Def(_) => self.syn_error(format!("{name} must be applied to arguments")),
            }
        } else {
            self.syn_error(format!("no such variable {name}"))
        }
    }

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
                if !r.fields1.has(f) {
                    return elab.syn_error(format!("no such field {f}"));
                }
                (
                    TmS::proj(tm_s, f, label),
                    elab.evaluator().proj(&tm_v, f, label),
                    elab.evaluator().field_ty(&ty_v, &tm_v, f),
                )
            }
            App1(L(_, Prim("id")), ob_n) => {
                let (ob_s, ob_v, ob_t) = elab.syn(ob_n);
                let TyV_::Object(ot) = &*ob_t else {
                    return elab.syn_error("can only apply @id to objects");
                };
                (
                    TmS::id(ob_s),
                    TmV::Tt,
                    TyV::morphism(MorphismType(Path::Id(ot.clone())), ob_v.clone(), ob_v),
                )
            }
            App2(L(_, Keyword("*")), f_n, g_n) => {
                let (f_s, _, f_ty) = elab.syn(f_n);
                let (g_s, _, g_ty) = elab.syn(g_n);
                let TyV_::Morphism(f_mt, f_dom, f_cod) = &*f_ty else {
                    elab.loc = Some(f_n.loc());
                    return elab.syn_error("expected a morphism");
                };
                let TyV_::Morphism(g_mt, g_dom, g_cod) = &*g_ty else {
                    elab.loc = Some(g_n.loc());
                    return elab.syn_error("expected a morphism");
                };
                if elab.dbl_theory().tgt(&f_mt.0) != elab.dbl_theory().src(&g_mt.0) {
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
                    TmV::Tt,
                    TyV::morphism(
                        MorphismType(
                            elab.dbl_theory()
                                .compose_types(Path::Seq(nonempty![f_mt.0.clone(), g_mt.0.clone()]))
                                .unwrap(),
                        ),
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
            Tag("tt") => (TmS::tt(), TmV::Tt, TyV::unit()),
            Tuple(_) => elab.syn_error("must check agains a type in order to construct a record"),
            Prim("hole") => elab.syn_error("explicit hole"),
            _ => elab.syn_error("unexpected notation for term"),
        }
    }

    fn chk(&mut self, ty: &TyV, n: &FNtn) -> (TmS, TmV) {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Tuple(field_ns) => {
                let TyV_::Record(r) = &**ty else {
                    return elab.chk_error("must check record former against record type");
                };
                if r.fields1.len() != field_ns.len() {
                    return elab.chk_error(format!(
                        "wrong number of fields provided, expected {}, got {}",
                        r.fields1.len(),
                        r.fields0.len(),
                    ));
                }
                let mut field_stxs = IndexMap::new();
                let mut field_vals = IndexMap::new();
                for (field_n, (name, (label, field_ty_s))) in field_ns.iter().zip(r.fields1.iter())
                {
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
                    let v = TmV::Cons(field_vals.clone().into());
                    let field_ty_v =
                        elab.evaluator().with_env(r.env.snoc(v.clone())).eval_ty(field_ty_s);
                    let (tm_s, tm_v) = elab.chk(&field_ty_v, tm_n);
                    field_stxs.insert(*name, (*label, tm_s));
                    field_vals.insert(*name, (*label, tm_v));
                }
                (TmS::cons(field_stxs.into()), TmV::Cons(field_vals.into()))
            }
            Prim("hole") => elab.chk_error("explicit hole"),
            _ => {
                let (tm_s, tm_v, synthed) = elab.syn(n);
                let eval = elab.evaluator();
                if let Err(e) = eval.convertable_ty(&synthed, ty) {
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
