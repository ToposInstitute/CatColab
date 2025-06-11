use fexplib::types::*;
use std::collections::HashMap;
use std::collections::HashSet;
use std::fmt;
use std::rc::Rc;
use ustr::{Ustr, ustr};

use crate::eval::*;
use crate::syntax::{self, *};

use tattle::{Loc, Reporter, declare_error};

pub struct Schema {
    pub obtypes: HashSet<Ustr>,
    pub mortypes: HashMap<Ustr, (ObType, ObType)>,
}

impl Schema {
    fn dom_cod(&self, mt: &MorType) -> Option<(ObType, ObType)> {
        match mt {
            MorType::Generator(name) => self.mortypes.get(name).copied(),
            MorType::Id(ot) => Some((*ot, *ot)),
        }
    }
}

pub struct Elaborator {
    reporter: Reporter,
    loc: Option<Loc>,
    schema: Rc<Schema>,
}

declare_error!(ELAB_ERROR, "elab", "error during elaboration");

macro_rules! error {
    ($elab:expr, $s:literal) => {{
        $elab.error(|f| write!(f, $s))
    }};

    ($elab:expr, $s:literal, $($arg:expr),+) => {{
        $elab.error(|f| write!(f, $s, $($arg),+))
    }};
}

pub struct Context {
    scope: Vec<(Ustr, TyVal)>,
    env: Env,
}

impl Context {
    pub fn new(state: &State) -> Self {
        Self {
            scope: Vec::new(),
            env: state.new_env(),
        }
    }

    fn lookup(&self, id: Ustr) -> Option<(Lvl, TyVal)> {
        self.scope
            .iter()
            .enumerate()
            .find(|(_, (n, _))| *n == id)
            .map(|(i, (_, ty))| (Lvl::new(i, Some(id)), ty.clone()))
    }

    fn intro(&mut self, name: Ustr, ty: TyVal) {
        let val = self.env.intro(&ty);
        self.env.values.push(val);
        self.scope.push((name, ty));
    }
}

impl Elaborator {
    pub fn new(reporter: Reporter, schema: Rc<Schema>) -> Elaborator {
        Elaborator {
            reporter,
            loc: None,
            schema,
        }
    }

    fn error<T, F: Fn(&mut fmt::Formatter) -> fmt::Result>(&self, f: F) -> Option<T> {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, f);
        None
    }

    fn at(&self, e: &FExp) -> Self {
        Self {
            reporter: self.reporter.clone(),
            loc: Some(e.loc()),
            schema: self.schema.clone(),
        }
    }

    pub fn morty(&self, e: &FExp) -> Option<MorType> {
        match e.ast0() {
            App1(L(_, Prim("Id")), L(_, Var(s))) => Some(MorType::Id(ObType((*s).into()))),
            Var(s) => Some((*s).into()),
            _ => error!(self.at(e), "could not elaborate morphism type"),
        }
    }

    pub fn ty(&self, ctx: &Context, e: &FExp) -> Option<(TyStx, TyVal)> {
        match e.ast0() {
            App1(L(_, Prim("Ob")), L(_, Var(obtype))) => {
                let ot = ustr(obtype);
                if self.schema.obtypes.contains(&ot) {
                    let ot = ObType(ot);
                    Some((TyStx::Object(ot), TyVal::Object(ot)))
                } else {
                    error!(self.at(e), "no such object type {ot}")
                }
            }
            App1(L(_, App1(L(_, App1(L(_, Prim("Mor")), mortype)), dome)), code) => {
                let mt = self.morty(mortype)?;
                match self.schema.dom_cod(&mt) {
                    Some((dt, ct)) => {
                        let (domstx, domval) = self.chk(ctx, &TyVal::Object(dt), dome)?;
                        let (codstx, codval) = self.chk(ctx, &TyVal::Object(ct), code)?;
                        Some((
                            TyStx::Morphism(mt, domstx, codstx),
                            TyVal::Morphism(mt, domval.as_object(), codval.as_object()),
                        ))
                    }
                    None => error!(self.at(e), "no such morphism type {mt:?}"),
                }
            }
            App2(L(_, Keyword("==")), e1, e2) => {
                let (tmstx1, tmval1, ty1) = self.syn(ctx, e1)?;
                let (tmstx2, tmval2) = self.chk(ctx, &ty1, e2)?;
                Some((TyStx::Equality(tmstx1, tmstx2), TyVal::Equality(tmval1, tmval2)))
            }
            App1(L(_, Prim("Notebook")), L(_, Var(id))) => {
                let nbref = ctx
                    .env
                    .lookup_notebook(ustr(id))
                    .or_else(|| error!(self.at(e), "no such notebook"))?;
                Some((TyStx::Notebook(nbref), TyVal::Notebook(nbref)))
            }
            _ => error!(self.at(e), "unexpected syntax for type"),
        }
    }

    pub fn syn(&self, ctx: &Context, e: &FExp) -> Option<(TmStx, TmVal, TyVal)> {
        match e.ast0() {
            Var(s) => {
                let (i, ty) = ctx.lookup(ustr(s))?;
                let v = ctx.env.get(i);
                Some((TmStx::Var(i), v, ty))
            }
            App1(e1, L(_, Field(f))) => {
                let f = ustr(f);
                let (tmstx, tmval, ty) = self.syn(ctx, e1)?;
                let nb = match &ty {
                    TyVal::Notebook(nbref) => ctx
                        .env
                        .get_notebook(nbref)
                        .or_else(|| error!(self.at(e), "no such notebook")),
                    _ => error!(self.at(e), "can only project from a notebook type"),
                }?;
                let (i, _) = nb
                    .cells
                    .iter()
                    .enumerate()
                    .find(|(_, c)| c.name == f)
                    .or_else(|| error!(self.at(e), "no such field {f}"))?;
                let nbenv = ctx.env.with_values(&*tmval.as_cells());
                let fieldtp = nbenv.eval_ty(&nb.cells[i].ty);
                let field = syntax::Field::new(i, Some(f));
                Some((TmStx::Proj(Rc::new(tmstx), field), tmval.proj(field), fieldtp))
            }
            App1(L(_, Prim("id")), obe) => {
                let (tmstx, tmval, ty) = self.syn(ctx, obe)?;
                let TyVal::Object(ot) = ty else {
                    return error!(self.at(e), "cannot take the identity morphism on a non-object");
                };
                Some((
                    TmStx::Identity(Rc::new(tmstx)),
                    ctx.env.identity(tmval.as_object()),
                    TyVal::Morphism(MorType::Id(ot), tmval.as_object(), tmval.as_object()),
                ))
            }
            App2(L(_, Keyword("*")), fe, ge) => {
                let (ftmstx, ftmval, fty) = self.syn(ctx, fe)?;
                let (gtmstx, gtmval, gty) = self.syn(ctx, ge)?;
                let ty = match (fty, gty) {
                    (TyVal::Morphism(fmt, fd, fc), TyVal::Morphism(gmt, gd, gc)) => {
                        if fmt == gmt {
                            if ctx.env.equal(fc, gd) {
                                Some(TyVal::Morphism(fmt, fd, gc))
                            } else {
                                error!(self.at(e), "mismatching domain and codomain for composite")
                            }
                        } else {
                            error!(self.at(e), "mismatching morphism types for composite")
                        }
                    }
                    _ => error!(self.at(e), "can only compose morphisms"),
                }?;
                Some((
                    TmStx::Compose(Rc::new(ftmstx), Rc::new(gtmstx)),
                    ctx.env.compose(ftmval.as_morphism(), gtmval.as_morphism()),
                    ty,
                ))
            }
            _ => error!(self.at(e), "unexpected syntax for term"),
        }
    }

    pub fn chk(&self, ctx: &Context, ty: &TyVal, e: &FExp) -> Option<(TmStx, TmVal)> {
        match e.ast0() {
            _ => {
                let (tmstx, tmval, synthed) = self.syn(ctx, e)?;
                if ctx.env.convertable_tys(ty, &synthed) {
                    Some((tmstx, tmval))
                } else {
                    error!(self.at(e), "expected term of type {ty:?} got {synthed:?}")
                }
            }
        }
    }

    pub fn notebook(&self, state: &State, e: &FExp) -> Option<Notebook> {
        let mut ctx = Context::new(state);
        let mut cells = Vec::new();
        match e.ast0() {
            Block(fields, None) => {
                for f in fields.iter() {
                    match f.ast0() {
                        App2(L(_, Keyword(":")), L(_, Var(name)), ty_expr) => {
                            let (tystx, tyval) = self.ty(&ctx, ty_expr)?;
                            let cell = Cell::new(ustr(*name), tystx);
                            ctx.intro(cell.name, tyval);
                            cells.push(cell);
                        }
                        _ => {
                            return error!(self.at(e), "expected a field");
                        }
                    }
                }
            }
            _ => return error!(self.at(e), "expected a record"),
        }
        Some(Notebook::new(cells))
    }
}
