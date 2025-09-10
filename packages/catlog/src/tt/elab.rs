/*! Elaboration for doublett */
use crate::dbl::category::VDblCategory;
use fnotation::*;
use scopeguard::{ScopeGuard, guard};
use tattle::declare_error;

use crate::{
    tt::{eval::*, prelude::*, stx::*, toplevel::*, val::*},
    zero::QualifiedName,
};

fn text_seg(s: impl Into<Ustr>) -> NameSegment {
    NameSegment::Text(s.into())
}

/** Context for top-level elaboration

Top-level elaboration is elaboration of declarations.
*/
pub struct TopElaborator<'a> {
    toplevel: &'a Toplevel,
    reporter: Reporter,
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

    fn annotated_def<'c>(&self, n: &FNtn<'c>) -> Option<(TopVarName, &'c FNtn<'c>, &'c FNtn<'c>)> {
        match n.ast0() {
            App2(
                L(_, Keyword(":=")),
                L(_, App2(L(_, Keyword(":")), L(_, Var(name)), annotn)),
                valn,
            ) => Some((NameSegment::Text(ustr(name)), annotn, valn)),
            _ => None,
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
    pub fn elab(&self, tn: &FNtnTop) -> Option<(TopVarName, TopDecl)> {
        match tn.name {
            "type" => {
                let (name, ty_n) = self.bare_def(tn.body).or_else(|| {
                    self.error(
                        tn.loc,
                        "unknown syntax for type declaration, expected <name> := <type>",
                    )
                })?;
                let (ty_s, ty_v) = self.elaborator().ty(ty_n)?;
                Some((name, TopDecl::Type(ty_s, ty_v)))
            }
            "term" => {
                let (name, ty_n, tm_n) = self.annotated_def(tn.body).or_else(|| {
                    self.error(
                        tn.loc,
                        "unknown syntax for term declaration, expected <name> : <type> := <term>",
                    )
                })?;
                let (_, ty_v) = self.elaborator().ty(ty_n)?;
                let (tm_s, tm_v) = self.elaborator().chk(&ty_v, tm_n)?;
                Some((name, TopDecl::Term(tm_s, tm_v, ty_v)))
            }
            _ => self.error(tn.loc, "unknown toplevel declaration"),
        }
    }
}

struct Context {
    env: Env,
    scope: Vec<(VarName, Option<TyV>)>,
}

struct ContextCheckpoint {
    env: Env,
    scope: usize,
}

impl Context {
    fn new() -> Self {
        Self {
            env: Env::Nil,
            scope: Vec::new(),
        }
    }

    fn checkpoint(&self) -> ContextCheckpoint {
        ContextCheckpoint {
            env: self.env.clone(),
            scope: self.scope.len(),
        }
    }

    fn reset_to(&mut self, c: ContextCheckpoint) {
        self.env = c.env;
        self.scope.truncate(c.scope);
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
        self.ctx.env = self.ctx.env.snoc(v.clone());
        self.ctx.scope.push((name, ty));
        v
    }

    fn lookup_ty(&self, name: VarName) -> Option<(TyS, TyV)> {
        let qname = QualifiedName::single(name);
        if self.toplevel.theory.has_ob(&qname) {
            Some((TyS::object(qname.clone()), TyV::object(qname)))
        } else if let Some(d) = self.toplevel.declarations.get(&name) {
            match d {
                TopDecl::Type(_, ty_v) => Some((TyS::topvar(name), ty_v.clone())),
                TopDecl::Term(tm_s, tm_v, ty_v) => self.error("{name} refers to a term not a type"),
            }
        } else {
            self.error(format!("no such type {name} defined"))
        }
    }

    fn morphism_ty(&mut self, n: &FNtn) -> Option<(MorphismType, ObjectType, ObjectType)> {
        let mut elab = self.enter(n.loc());
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
                TopDecl::Type(_, ty_v) => self.error(format!("{name} refers type, not term")),
                TopDecl::Term(_, tm_v, ty_v) => {
                    Some((TmS::topvar(name), tm_v.clone(), ty_v.clone()))
                }
            }
        } else {
            self.error(format!("no such variable {name}"))
        }
    }

    fn syn(&mut self, n: &FNtn) -> Option<(TmS, TmV, TyV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => elab.lookup_tm(text_seg(*name)),
            _ => elab.error("unexpected notation for term"),
        }
    }

    fn chk(&mut self, ty: &TyV, n: &FNtn) -> Option<(TmS, TmV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Tuple(field_ns) => todo!(),
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
