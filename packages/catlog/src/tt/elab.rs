use fnotation::*;
use scopeguard::{ScopeGuard, guard};
use tattle::declare_error;

use crate::{eval::*, prelude::*, stx::*, toplevel::*, val::*};

pub struct TopElaborator<'a, 'b> {
    toplevel: &'b Toplevel<'a>,
    reporter: Reporter,
    bump: &'a Bump,
}

impl<'a, 'b> TopElaborator<'a, 'b> {
    pub fn new(toplevel: &'b Toplevel<'a>, reporter: Reporter, bump: &'a Bump) -> Self {
        Self {
            toplevel,
            reporter,
            bump,
        }
    }

    fn bare_def<'c>(&self, n: &FNtn<'c>) -> Option<(TopVarName, &'c FNtn<'c>)> {
        match n.ast0() {
            App2(L(_, Keyword(":=")), L(_, Var(name)), tn) => Some((ustr(name), tn)),
            _ => None,
        }
    }

    fn annotated_def<'c>(&self, n: &FNtn<'c>) -> Option<(TopVarName, &'c FNtn<'c>, &'c FNtn<'c>)> {
        match n.ast0() {
            App2(
                L(_, Keyword(":=")),
                L(_, App2(L(_, Keyword(":")), L(_, Var(name)), annotn)),
                valn,
            ) => Some((ustr(name), annotn, valn)),
            _ => None,
        }
    }

    fn elaborator(&self) -> Elaborator<'a, 'b> {
        Elaborator::new(self.reporter.clone(), self.toplevel, self.bump)
    }

    fn error<T>(&self, loc: Loc, msg: impl Into<String>) -> Option<T> {
        self.reporter.error(loc, ELAB_ERROR, msg.into());
        None
    }

    pub fn elab(&self, tn: &FNtnTop) -> Option<(TopVarName, TopDecl<'a>)> {
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
                let (tm_s, tm_v) = self.elaborator().chk(ty_v, tm_n)?;
                Some((name, TopDecl::Term(tm_s, tm_v, ty_v)))
            }
            _ => self.error(tn.loc, "unknown toplevel declaration"),
        }
    }
}

struct Context<'a> {
    env: Env<'a>,
    scope: Vec<(Ustr, Option<TyV<'a>>)>,
}

struct ContextCheckpoint<'a> {
    env: Env<'a>,
    scope: usize,
}

impl<'a> Context<'a> {
    fn new() -> Self {
        Self {
            env: Env::Nil,
            scope: Vec::new(),
        }
    }

    fn checkpoint(&self) -> ContextCheckpoint<'a> {
        ContextCheckpoint {
            env: self.env,
            scope: self.scope.len(),
        }
    }

    fn reset_to(&mut self, c: ContextCheckpoint<'a>) {
        self.env = c.env;
        self.scope.truncate(c.scope);
    }
}

struct Elaborator<'a, 'b> {
    reporter: Reporter,
    toplevel: &'b Toplevel<'a>,
    bump: &'a Bump,
    loc: Option<Loc>,
    ctx: Context<'a>,
}

struct ElaboratorCheckpoint<'a> {
    loc: Option<Loc>,
    ctx: ContextCheckpoint<'a>,
}

declare_error!(ELAB_ERROR, "elab", "an error during elaboration");

impl<'a, 'b> Elaborator<'a, 'b> {
    fn new(reporter: Reporter, toplevel: &'b Toplevel<'a>, bump: &'a Bump) -> Self {
        Self {
            reporter,
            toplevel,
            bump,
            loc: None,
            ctx: Context::new(),
        }
    }

    fn checkpoint(&self) -> ElaboratorCheckpoint<'a> {
        ElaboratorCheckpoint {
            loc: self.loc,
            ctx: self.ctx.checkpoint(),
        }
    }

    fn reset_to(&mut self, c: ElaboratorCheckpoint<'a>) {
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

    fn ty(&mut self, n: &FNtn) -> Option<(TyS<'a>, TyV<'a>)> {
        todo!()
    }

    fn syn(&mut self, n: &FNtn) -> Option<(TmS<'a>, TmV<'a>, TyV<'a>)> {
        todo!()
    }

    fn chk(&mut self, ty: TyV<'a>, n: &FNtn) -> Option<(TmS<'a>, TmV<'a>)> {
        todo!()
    }
}
