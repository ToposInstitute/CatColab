//! Elaboration for doublett
use crate::{
    dbl::{
        category::VDblCategory,
        model::{DblModel, DiscreteDblModel, FgDblModel},
        theory::DblTheory,
    },
    one::FgCategory,
};
use fnotation::*;
use nonempty::nonempty;
use scopeguard::{ScopeGuard, guard};
use std::fmt;

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
pub struct TopElaborator<'a> {
    toplevel: &'a Toplevel,
    reporter: Reporter,
}

fn model_output(out: &mut impl fmt::Write, model: &DiscreteDblModel) -> fmt::Result {
    writeln!(out)?;
    writeln!(out, "#/ object generators: ")?;
    for obgen in model.ob_generators() {
        writeln!(out, "#/  {} : {}", obgen, model.ob_type(&obgen))?;
    }
    writeln!(out, "#/ morphism generators: ")?;
    for morgen in model.mor_generators() {
        writeln!(
            out,
            "#/  {} : {} -> {} ({})",
            morgen,
            model.mor_generator_dom(&morgen),
            model.mor_generator_cod(&morgen),
            MorphismType(model.mor_generator_type(&morgen))
        )?;
    }
    Ok(())
}

impl<'a> TopElaborator<'a> {
    /// Constructor
    pub fn new(toplevel: &'a Toplevel, reporter: Reporter) -> Self {
        Self { toplevel, reporter }
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
                        Some((text_seg(*name), Some(args.as_slice()), annotn, valn))
                    }
                    Var(name) => Some((text_seg(*name), None, annotn, valn)),
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

    fn elaborator(&self) -> Elaborator<'a> {
        Elaborator::new(self.reporter.clone(), self.toplevel)
    }

    fn error<T>(&self, loc: Loc, msg: impl Into<String>) -> Option<T> {
        self.reporter.error(loc, ELAB_ERROR, msg.into());
        None
    }

    /// Elaborate a single top-level declaration
    pub fn elab(&self, tn: &FNtnTop) -> Option<TopElabResult> {
        match tn.name {
            "type" => {
                let (name, ty_n) = self.bare_def(tn.body).or_else(|| {
                    self.error(
                        tn.loc,
                        "unknown syntax for type declaration, expected <name> := <type>",
                    )
                })?;
                let (ty_s, ty_v) = self.elaborator().ty(ty_n)?;
                Some(TopElabResult::Declaration(name, TopDecl::Type(ty_s, ty_v)))
            }
            "def" => {
                let (name, args_n, ty_n, tm_n) = self.annotated_def(tn.body).or_else(|| {
                    self.error(
                        tn.loc,
                        "unknown syntax for term declaration, expected <name> : <type> := <term>",
                    )
                })?;
                match args_n {
                    Some(args_n) => {
                        let mut elab = self.elaborator();
                        let mut args_stx = IndexMap::new();
                        for arg_n in args_n {
                            let (name, ty_s, ty_v) = elab.binding(arg_n)?;
                            args_stx.insert(name, ty_s);
                            elab.intro(name, Some(ty_v));
                        }
                        let (ret_ty_s, ret_ty_v) = elab.ty(ty_n)?;
                        let (body_s, _) = elab.chk(&ret_ty_v, tm_n)?;
                        Some(TopElabResult::Declaration(
                            name,
                            TopDecl::Def(args_stx.into(), ret_ty_s, body_s),
                        ))
                    }
                    None => {
                        let (_, ty_v) = self.elaborator().ty(ty_n)?;
                        let (tm_s, tm_v) = self.elaborator().chk(&ty_v, tm_n)?;
                        Some(TopElabResult::Declaration(name, TopDecl::DefConst(tm_s, tm_v, ty_v)))
                    }
                }
            }
            "syn" => {
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                let mut elab = self.elaborator();
                for ctx_n in ctx_ns {
                    let (name, _, ty_v) = elab.binding(ctx_n)?;
                    elab.intro(name, Some(ty_v));
                }
                let (tm_s, _, ty_v) = elab.syn(n)?;
                Some(TopElabResult::Output(format!(
                    "{tm_s} : {}",
                    elab.evaluator().quote_ty(&ty_v)
                )))
            }
            "norm" => {
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                let mut elab = self.elaborator();
                for ctx_n in ctx_ns {
                    let (name, _, ty_v) = elab.binding(ctx_n)?;
                    elab.intro(name, Some(ty_v));
                }
                let (_, tm_v, ty_v) = elab.syn(n)?;
                let eval = elab.evaluator();
                Some(TopElabResult::Output(format!("{}", eval.quote_tm(&eval.eta(&tm_v, &ty_v)),)))
            }
            "chk" => {
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                let mut elab = self.elaborator();
                for ctx_n in ctx_ns {
                    let (name, _, ty_v) = elab.binding(ctx_n)?;
                    elab.intro(name, Some(ty_v));
                }
                let (tm_n, ty_n) = match n.ast0() {
                    App2(L(_, Keyword(":")), tm_n, ty_n) => (tm_n, ty_n),
                    _ => return elab.error("expected <expr> : <type>"),
                };
                let (_, ty_v) = elab.ty(ty_n)?;
                let (tm_s, _) = elab.chk(&ty_v, tm_n)?;
                Some(TopElabResult::Output(format!("{tm_s}")))
            }
            "generate" => {
                let mut elab = self.elaborator();
                let (_, ty_v) = elab.ty(tn.body)?;
                let model = generate(self.toplevel, &ty_v);
                let mut out = String::new();
                model_output(&mut out, &model).unwrap();
                Some(TopElabResult::Output(out))
            }
            _ => self.error(tn.loc, "unknown toplevel declaration"),
        }
    }
}

struct Elaborator<'a> {
    reporter: Reporter,
    toplevel: &'a Toplevel,
    loc: Option<Loc>,
    ctx: Context,
}

struct ElaboratorCheckpoint {
    loc: Option<Loc>,
    ctx: ContextCheckpoint,
}

declare_error!(ELAB_ERROR, "elab", "an error during elaboration");

impl<'a> Elaborator<'a> {
    fn new(reporter: Reporter, toplevel: &'a Toplevel) -> Self {
        Self {
            reporter,
            toplevel,
            loc: None,
            ctx: Context::new(),
        }
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

    fn error<T>(&self, msg: impl Into<String>) -> Option<T> {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        None
    }

    fn evaluator(&self) -> Evaluator<'a> {
        Evaluator::new(self.toplevel, self.ctx.env.clone(), self.ctx.scope.len())
    }

    fn intro(&mut self, name: VarName, ty: Option<TyV>) -> TmV {
        let v = TmV::Neu(
            TmN::var(self.ctx.scope.len().into(), name),
            ty.clone().unwrap_or(TyV::unit()),
        );
        let v = if let Some(ty) = &ty {
            self.evaluator().eta(&v, ty)
        } else {
            v
        };
        self.ctx.env = self.ctx.env.snoc(v.clone());
        self.ctx.scope.push((name, ty));
        v
    }

    fn binding(&mut self, n: &FNtn) -> Option<(VarName, TyS, TyV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            App2(L(_, Keyword(":")), L(_, Var(name)), ty_n) => {
                let (ty_s, ty_v) = elab.ty(ty_n)?;
                Some((text_seg(*name), ty_s, ty_v))
            }
            _ => elab.error("unexpected notation for binding"),
        }
    }

    fn lookup_ty(&self, name: VarName) -> Option<(TyS, TyV)> {
        let qname = QualifiedName::single(name);
        if self.toplevel.theory.has_ob(&qname) {
            Some((TyS::object(qname.clone()), TyV::object(qname)))
        } else if let Some(d) = self.toplevel.declarations.get(&name) {
            match d {
                TopDecl::Type(_, ty_v) => Some((TyS::topvar(name), ty_v.clone())),
                TopDecl::Def(_, _, _) | TopDecl::DefConst(_, _, _) => {
                    self.error("{name} refers to a term not a type")
                }
            }
        } else {
            self.error(format!("no such type {name} defined"))
        }
    }

    fn morphism_ty(&mut self, n: &FNtn) -> Option<(MorphismType, ObjectType, ObjectType)> {
        let elab = self.enter(n.loc());
        match n.ast0() {
            App1(L(_, Keyword("Id")), L(_, Var(name))) => {
                let qname = QualifiedName::single(text_seg(*name));
                if elab.toplevel.theory.has_ob(&qname) {
                    Some((MorphismType(Path::Id(qname.clone())), qname.clone(), qname))
                } else {
                    elab.error(format!("no such object type {name}"))
                }
            }
            Var(name) => {
                let qname = QualifiedName::single(text_seg(*name));
                let mt = Path::single(qname);
                let theory = &elab.toplevel.theory;
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

    fn path(&mut self, n: &FNtn) -> Option<Vec<NameSegment>> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Field(f) => Some(vec![text_seg(*f)]),
            App1(p_n, L(_, Field(f))) => {
                let mut p = elab.path(p_n)?;
                p.push(text_seg(*f));
                Some(p)
            }
            _ => elab.error("unexpected notation for path"),
        }
    }

    fn specialization(&mut self, n: &FNtn) -> Option<(Vec<NameSegment>, TyS, TyV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            App2(L(_, Keyword(":")), p_n, ty_n) => {
                let p = elab.path(p_n)?;
                let (ty_s, ty_v) = elab.ty(ty_n)?;
                Some((p, ty_s, ty_v))
            }
            App2(L(_, Keyword(":=")), p_n, tm_n) => {
                let p = elab.path(p_n)?;
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n)?;
                Some((p, TyS::sing(elab.evaluator().quote_ty(&ty_v), tm_s), TyV::sing(ty_v, tm_v)))
            }
            _ => elab.error("unexpected notation for specialization"),
        }
    }

    fn ty(&mut self, n: &FNtn) -> Option<(TyS, TyV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => elab.lookup_ty(text_seg(*name)),
            Keyword("Unit") => Some((TyS::unit(), TyV::unit())),
            App1(L(_, Prim("sing")), tm_n) => {
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n)?;
                Some((TyS::sing(elab.evaluator().quote_ty(&ty_v), tm_s), TyV::sing(ty_v, tm_v)))
            }
            App1(mt_n, L(_, Tuple(domcod_n))) => {
                if domcod_n.len() != 2 {
                    return elab.error("expected two arguments for morphism type");
                }
                let (mt, dom_ty, cod_ty) = elab.morphism_ty(mt_n)?;
                let (dom_s, dom_v) = elab.chk(&TyV::object(dom_ty.clone()), domcod_n[0])?;
                let (cod_s, cod_v) = elab.chk(&TyV::object(cod_ty.clone()), domcod_n[1])?;
                Some((
                    TyS::morphism(mt.clone(), dom_s, cod_s),
                    TyV::morphism(mt.clone(), dom_v, cod_v),
                ))
            }
            Tuple(field_ns) => {
                let mut field_ty0s = Vec::<(FieldName, Ty0)>::new();
                let mut field_ty_vs = Vec::<(FieldName, TyV)>::new();
                let mut failed = false;
                let self_var = elab.intro(text_seg("self"), None).as_neu();
                let c = elab.checkpoint();
                for field_n in field_ns.iter() {
                    elab.loc = Some(field_n.loc());
                    let Some((name, ty_n)) = (match field_n.ast0() {
                        App2(L(_, Keyword(":")), L(_, Var(name)), ty_n) => {
                            Some((text_seg(*name), ty_n))
                        }
                        _ => elab.error("expected fields in the form <name> : <type>"),
                    }) else {
                        println!("failed");
                        failed = true;
                        continue;
                    };
                    let Some((_, ty_v)) = elab.ty(ty_n) else {
                        failed = true;
                        continue;
                    };
                    field_ty0s.push((name, ty_v.ty0()));
                    field_ty_vs.push((name, ty_v.clone()));
                    elab.ctx.scope.push((name, Some(ty_v.clone())));
                    elab.ctx.env =
                        elab.ctx.env.snoc(TmV::Neu(TmN::proj(self_var.clone(), name), ty_v));
                }
                if failed {
                    return None;
                }
                elab.reset_to(c);
                let field_tys: Row<_> = field_ty_vs
                    .iter()
                    .map(|(name, ty_v)| (*name, elab.evaluator().quote_ty(ty_v)))
                    .collect();
                let field_ty0s: Row<_> = field_ty0s.into_iter().collect();
                let r_s = RecordS::new(field_ty0s.clone(), field_tys.clone());
                let r_v = RecordV::new(field_ty0s, elab.ctx.env.clone(), field_tys, Dtry::empty());
                Some((TyS::record(r_s), TyV::record(r_v)))
            }
            App2(L(_, Keyword("&")), ty_n, L(_, Tuple(specialization_ns))) => {
                let (ty_s, mut ty_v) = elab.ty(ty_n)?;
                let mut specializations = Vec::new();
                // Approach:
                //
                // 1. Write a try_specialize method which attempts to specialize ty_v
                // with a given path + type (e.g. `.x.y : @sing a`), returning a new
                // type or an error message.
                // 2. Iteratively apply try_specialize to each specialization in turn.
                for specialization_n in specialization_ns.iter() {
                    elab.loc = Some(specialization_n.loc());
                    let (path, sty_s, sty_v) = elab.specialization(specialization_n)?;
                    match elab.evaluator().try_specialize(&ty_v, &path, sty_v) {
                        Ok(specialized) => {
                            ty_v = specialized;
                            specializations.push((path, sty_s));
                        }
                        Err(s) => {
                            return elab.error(format!("Failed to specialize:\n... because {s}"));
                        }
                    }
                }
                Some((TyS::specialize(ty_s, specializations), ty_v))
            }
            _ => elab.error("unexpected notation for type"),
        }
    }

    fn lookup_tm(&mut self, name: VarName) -> Option<(TmS, TmV, TyV)> {
        if let Some((i, (_, ty))) =
            self.ctx.scope.iter().rev().enumerate().find(|(_, (vname, _))| *vname == name)
        {
            let i = i.into();
            Some((TmS::var(i, name), self.ctx.env.get(*i).unwrap().clone(), ty.clone().unwrap()))
        } else if let Some(d) = self.toplevel.lookup(name) {
            match d {
                TopDecl::Type(_, _) => self.error(format!("{name} refers type, not term")),
                TopDecl::DefConst(_, tm_v, ty_v) => {
                    Some((TmS::topvar(name), tm_v.clone(), ty_v.clone()))
                }
                TopDecl::Def(_, _, _) => self.error(format!("{name} must be applied to arguments")),
            }
        } else {
            self.error(format!("no such variable {name}"))
        }
    }

    fn syn(&mut self, n: &FNtn) -> Option<(TmS, TmV, TyV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => elab.lookup_tm(text_seg(*name)),
            App1(tm_n, L(_, Field(f))) => {
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n)?;
                let TyV_::Record(r) = &*ty_v else {
                    return elab.error("can only project from record type");
                };
                let f = text_seg(*f);
                if !r.fields1.has(f) {
                    return elab.error(format!("no such field {f}"));
                }
                Some((
                    TmS::proj(tm_s, f),
                    elab.evaluator().proj(&tm_v, f),
                    elab.evaluator().field_ty(&ty_v, &tm_v, f),
                ))
            }
            App1(L(_, Prim("id")), ob_n) => {
                let (ob_s, ob_v, ob_t) = elab.syn(ob_n)?;
                let TyV_::Object(ot) = &*ob_t else {
                    return elab.error("can only apply @id to objects");
                };
                Some((
                    TmS::id(ob_s),
                    TmV::Tt,
                    TyV::morphism(MorphismType(Path::Id(ot.clone())), ob_v.clone(), ob_v),
                ))
            }
            App2(L(_, Keyword("*")), f_n, g_n) => {
                let (f_s, _, f_ty) = elab.syn(f_n)?;
                let (g_s, _, g_ty) = elab.syn(g_n)?;
                let TyV_::Morphism(f_mt, f_dom, f_cod) = &*f_ty else {
                    elab.loc = Some(f_n.loc());
                    return elab.error("expected a morphism");
                };
                let TyV_::Morphism(g_mt, g_dom, g_cod) = &*g_ty else {
                    elab.loc = Some(g_n.loc());
                    return elab.error("expected a morphism");
                };
                if elab.toplevel.theory.tgt(&f_mt.0) != elab.toplevel.theory.src(&g_mt.0) {
                    return elab.error("incompatible morphism types");
                }
                if let Err(s) = elab.evaluator().equal_tm(f_cod, g_dom) {
                    return elab.error(format!(
                        "codomain {} and domain {} not equal:\n...because {}",
                        elab.evaluator().quote_tm(f_cod),
                        elab.evaluator().quote_tm(g_dom),
                        s.pretty()
                    ));
                }
                Some((
                    TmS::compose(f_s, g_s),
                    TmV::Tt,
                    TyV::morphism(
                        MorphismType(
                            elab.toplevel
                                .theory
                                .compose_types(Path::Seq(nonempty![f_mt.0.clone(), g_mt.0.clone()]))
                                .unwrap(),
                        ),
                        f_dom.clone(),
                        g_cod.clone(),
                    ),
                ))
            }
            App1(L(_, Var(tv)), L(_, Tuple(args_n))) => {
                let tv = text_seg(*tv);
                let Some(TopDecl::Def(arg_tys_s, ret_ty_s, body_s)) = elab.toplevel.lookup(tv)
                else {
                    return elab.error(format!("no such toplevel def {tv}"));
                };
                let mut arg_stxs = Vec::new();
                let mut env = Env::nil();
                if args_n.len() != arg_tys_s.len() {
                    return elab.error(format!(
                        "wrong number of args for {tv}, expected {}, got {}",
                        arg_tys_s.len(),
                        args_n.len()
                    ));
                }
                for (arg_n, (_, arg_ty_s)) in args_n.iter().zip(arg_tys_s.iter()) {
                    let arg_ty_v = elab.evaluator().with_env(env.clone()).eval_ty(arg_ty_s);
                    let (arg_s, arg_v) = elab.chk(&arg_ty_v, arg_n)?;
                    arg_stxs.push(arg_s);
                    env = env.snoc(arg_v);
                }
                let eval = elab.evaluator().with_env(env.clone());
                Some((TmS::topapp(tv, arg_stxs), eval.eval_tm(body_s), eval.eval_ty(ret_ty_s)))
            }
            Tag("tt") => Some((TmS::tt(), TmV::Tt, TyV::unit())),
            Tuple(_) => elab.error("must check agains a type in order to construct a record"),
            _ => elab.error("unexpected notation for term"),
        }
    }

    fn chk(&mut self, ty: &TyV, n: &FNtn) -> Option<(TmS, TmV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Tuple(field_ns) => {
                let TyV_::Record(r) = &**ty else {
                    return elab.error("must check record former against record type");
                };
                if r.fields1.len() != field_ns.len() {
                    return elab.error(format!(
                        "wrong number of fields provided, expected {}, got {}",
                        r.fields1.len(),
                        r.fields0.len(),
                    ));
                }
                let mut field_stxs = IndexMap::new();
                let mut field_vals = IndexMap::new();
                for (field_n, (name, field_ty_s)) in field_ns.iter().zip(r.fields1.iter()) {
                    elab.loc = Some(field_n.loc());
                    let tm_n = match field_n.ast0() {
                        App2(L(_, Keyword(":=")), L(_, Var(given_name)), field_val_n) => {
                            if text_seg(*given_name) == *name {
                                field_val_n
                            } else {
                                return elab.error(format!("unexpected field {given_name}"));
                            }
                        }
                        _ => {
                            return elab.error("unexpected notation for field");
                        }
                    };
                    let v = TmV::Cons(field_vals.clone().into());
                    let field_ty_v =
                        elab.evaluator().with_env(r.env.snoc(v.clone())).eval_ty(field_ty_s);
                    let (tm_s, tm_v) = elab.chk(&field_ty_v, tm_n)?;
                    field_stxs.insert(*name, tm_s);
                    field_vals.insert(*name, tm_v);
                }
                Some((TmS::cons(field_stxs.into()), TmV::Cons(field_vals.into())))
            }
            _ => {
                let (tm_s, tm_v, synthed) = elab.syn(n)?;
                let eval = elab.evaluator();
                if let Err(e) = eval.convertable_ty(&synthed, ty) {
                    return elab.error(format!(
                        "synthesized type {} does not match expected type {}:\n{}",
                        eval.quote_ty(&synthed),
                        eval.quote_ty(ty),
                        e.pretty()
                    ));
                }
                if let Err(e) = eval.element_of(&tm_v, ty) {
                    return elab.error(format!(
                        "evaluated term {} is not an element of specialized type {}:\n{}",
                        eval.quote_tm(&tm_v),
                        eval.quote_ty(ty),
                        e.pretty()
                    ));
                }
                Some((tm_s, tm_v))
            }
        }
    }
}
