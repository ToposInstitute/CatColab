// use catlog::dbl::category::{VDCWithComposites, VDblCategory};
// use catlog::dbl::theory::UstrDiscreteDblTheory;
// use catlog::one::Path;
// use egg::Id;
// use fexplib::types::*;
// use std::rc::Rc;
// use ustr::{Ustr, ustr};

// use crate::eval::*;
// use crate::syntax::{self, *};

// use tattle::{Loc, Reporter, declare_error};

// pub type Schema = UstrDiscreteDblTheory;

// pub struct Elaborator {
//     reporter: Reporter,
//     loc: Option<Loc>,
//     schema: Rc<Schema>,
// }

// declare_error!(ELAB_ERROR, "elab", "error during elaboration");

// macro_rules! error {
//     ($elab:expr, $s:literal) => {{
//         $elab.error(format!($s))
//     }};

//     ($elab:expr, $s:literal, $($arg:expr),+) => {{
//         $elab.error(format!($s, $($arg),+))
//     }};
// }

// pub struct Context {
//     scope: Vec<(Ustr, TyVal)>,
//     env: Env,
// }

// impl Context {
//     pub fn new(notebooks: Rc<dyn NotebookStorage>) -> Self {
//         Self {
//             scope: Vec::new(),
//             env: State::empty(notebooks).new_env(),
//         }
//     }

//     fn lookup(&self, id: Ustr) -> Option<(Lvl, TyVal)> {
//         self.scope
//             .iter()
//             .enumerate()
//             .find(|(_, (n, _))| *n == id)
//             .map(|(i, (_, ty))| (Lvl::new(i, Some(id)), ty.clone()))
//     }

//     pub fn intro(&mut self, name: Ustr, ty: TyVal) {
//         let val = self.env.intro(&ty);
//         self.env.values.push(val);
//         self.scope.push((name, ty));
//     }

//     fn has_generator(&self, val: &TmVal, generator_idx: usize) -> bool {
//         let id = self.env.id_for_generator(generator_idx);
//         match val {
//             TmVal::Object(id1) => self.env.find(*id1) == id,
//             TmVal::Morphism(id1) => self.env.find(*id1) == id,
//             TmVal::Cells(_, generator_range) => generator_range.contains(generator_idx),
//             TmVal::Erased => false,
//         }
//     }

//     fn search_for_generator(&self, values: &[TmVal], generator_idx: usize) -> Option<usize> {
//         values
//             .iter()
//             .enumerate()
//             .find(|(_, v)| self.has_generator(v, generator_idx))
//             .map(|(i, _)| i)
//     }

//     fn quote_id(&self, id: Id) -> TmStx {
//         let expr = self.env.extract(id);
//         let CatLang::Num(generator_idx) = expr.first().unwrap() else {
//             panic!()
//         };
//         self.quote_generator(*generator_idx as usize)
//     }

//     fn quote_tm(&self, v: &TmVal) -> TmStx {
//         match v {
//             TmVal::Object(id) | TmVal::Morphism(id) => self.quote_id(*id),
//             TmVal::Cells(tm_vals, _) => TmStx::MkNotebook(Rc::new(
//                 tm_vals.iter().map(|(name, v)| (*name, self.quote_tm(v))).collect(),
//             )),
//             TmVal::Erased => TmStx::Refl,
//         }
//     }

//     fn quote_generator(&self, generator_idx: usize) -> TmStx {
//         let lvl = self.search_for_generator(&self.env.values, generator_idx).unwrap();
//         let name = self.scope[lvl].0;
//         let tm = TmStx::Var(Lvl::new(lvl, name.into()));
//         self.quote_generator_in(generator_idx, tm, &self.env.values[lvl])
//     }

//     fn quote_generator_in(&self, generator_idx: usize, current: TmStx, val: &TmVal) -> TmStx {
//         match val {
//             TmVal::Object(_) => current,
//             TmVal::Morphism(_) => current,
//             TmVal::Cells(items, _) => {
//                 let lvl =
//                     items.iter().position(|(_, v)| self.has_generator(v, generator_idx)).unwrap();
//                 let name = items[lvl].0;
//                 self.quote_generator_in(
//                     generator_idx,
//                     TmStx::Proj(Rc::new(current), syntax::Field::new(lvl, name.into())),
//                     &items[lvl].1,
//                 )
//             }
//             TmVal::Erased => current,
//         }
//     }

//     fn quote_ty(&self, ty: &TyVal) -> TyStx {
//         match ty {
//             TyVal::Object(ot) => TyStx::Object(*ot),
//             TyVal::Morphism(path, d, c) => {
//                 TyStx::Morphism(path.clone(), self.quote_id(*d), self.quote_id(*c))
//             }
//             TyVal::Notebook(notebook_ref) => TyStx::Notebook(*notebook_ref),
//             TyVal::Equality(lhs, rhs) => TyStx::Equality(self.quote_tm(lhs), self.quote_tm(rhs)),
//         }
//     }
// }

// impl Elaborator {
//     pub fn new(reporter: Reporter, schema: Rc<Schema>) -> Elaborator {
//         Elaborator {
//             reporter,
//             loc: None,
//             schema,
//         }
//     }

//     pub fn error<T>(&self, message: String) -> Option<T> {
//         self.reporter.error_option_loc(self.loc, ELAB_ERROR, message);
//         None
//     }

//     fn at(&self, e: &FExp) -> Self {
//         Self {
//             reporter: self.reporter.clone(),
//             loc: Some(e.loc()),
//             schema: self.schema.clone(),
//         }
//     }

//     pub fn obty(&self, e: &FExp) -> Option<Ustr> {
//         match e.ast0() {
//             Var(s) => {
//                 if self.schema.has_ob(&ustr(s)) {
//                     Some(ustr(s))
//                 } else {
//                     error!(self.at(e), "no such object type {s}")
//                 }
//             }
//             _ => error!(self.at(e), "unexpected syntax for object type"),
//         }
//     }

//     pub fn morty(&self, e: &FExp) -> Option<Path<Ustr, Ustr>> {
//         match e.ast0() {
//             App1(L(_, Prim("Id")), obtye) => Some(Path::empty(self.obty(obtye)?)),
//             Var(s) => {
//                 let p = Path::single(ustr(s));
//                 if self.schema.has_proarrow(&p) {
//                     Some(p)
//                 } else {
//                     error!(self.at(e), "no such morphism type {s}")
//                 }
//             }
//             _ => error!(self.at(e), "could not elaborate morphism type"),
//         }
//     }

//     pub fn ty(&self, ctx: &Context, e: &FExp) -> Option<(TyStx, TyVal)> {
//         match e.ast0() {
//             App1(L(_, Prim("Ob")), L(_, Var(obtype))) => {
//                 let ot = ustr(obtype);
//                 if self.schema.has_ob(&ot) {
//                     Some((TyStx::Object(ot), TyVal::Object(ot)))
//                 } else {
//                     error!(self.at(e), "no such object type {ot}")
//                 }
//             }
//             App1(L(_, App1(L(_, App1(L(_, Prim("Mor")), mortype)), dome)), code) => {
//                 let mt = self.morty(mortype)?;
//                 let (dt, ct) = (self.schema.src(&mt), self.schema.tgt(&mt));
//                 let domres = self.chk(ctx, &TyVal::Object(dt), dome);
//                 let codres = self.chk(ctx, &TyVal::Object(ct), code);
//                 let (domstx, domval) = domres?;
//                 let (codstx, codval) = codres?;
//                 Some((
//                     TyStx::Morphism(mt.clone(), domstx, codstx),
//                     TyVal::Morphism(mt, domval.as_object(), codval.as_object()),
//                 ))
//             }
//             App2(L(_, Keyword("==")), e1, e2) => {
//                 let (tmstx1, tmval1, ty1) = self.syn(ctx, e1)?;
//                 let (tmstx2, tmval2) = self.chk(ctx, &ty1, e2)?;
//                 Some((TyStx::Equality(tmstx1, tmstx2), TyVal::Equality(tmval1, tmval2)))
//             }
//             App1(L(_, Prim("Notebook")), L(_, Var(id))) => {
//                 let nbref = ctx
//                     .env
//                     .lookup_notebook(ustr(id))
//                     .or_else(|| error!(self.at(e), "no such notebook"))?;
//                 Some((TyStx::Notebook(nbref), TyVal::Notebook(nbref)))
//             }
//             _ => error!(self.at(e), "unexpected syntax for type"),
//         }
//     }

//     pub fn syn(&self, ctx: &Context, e: &FExp) -> Option<(TmStx, TmVal, TyVal)> {
//         match e.ast0() {
//             Var(s) => {
//                 let (i, ty) =
//                     ctx.lookup(ustr(s)).or_else(|| error!(self.at(e), "no such variable {s}"))?;
//                 let v = ctx.env.get(i);
//                 Some((TmStx::Var(i), v, ty))
//             }
//             App1(e1, L(_, Field(f))) => {
//                 let f = ustr(f);
//                 let (tmstx, tmval, ty) = self.syn(ctx, e1)?;
//                 let nb = match &ty {
//                     TyVal::Notebook(nbref) => ctx
//                         .env
//                         .get_notebook(nbref)
//                         .or_else(|| error!(self.at(e), "no such notebook")),
//                     _ => error!(self.at(e), "can only project from a notebook type"),
//                 }?;
//                 let (i, _) = nb
//                     .cells
//                     .iter()
//                     .enumerate()
//                     .find(|(_, c)| c.name == f)
//                     .or_else(|| error!(self.at(e), "no such field {f}"))?;
//                 let nbenv = ctx.env.with_values(&tmval.as_cells());
//                 let fieldtp = nbenv.eval_ty(&nb.cells[i].ty);
//                 let field = syntax::Field::new(i, Some(f));
//                 Some((TmStx::Proj(Rc::new(tmstx), field), tmval.proj(field), fieldtp))
//             }
//             App1(L(_, Prim("id")), obe) => {
//                 let (tmstx, tmval, ty) = self.syn(ctx, obe)?;
//                 let TyVal::Object(ot) = ty else {
//                     return error!(self.at(e), "cannot take the identity morphism on a non-object");
//                 };
//                 Some((
//                     TmStx::Identity(Rc::new(tmstx)),
//                     ctx.env.identity(tmval.as_object()),
//                     TyVal::Morphism(MorType::Id(ot), tmval.as_object(), tmval.as_object()),
//                 ))
//             }
//             App2(L(_, Keyword("*")), fe, ge) => {
//                 let (ftmstx, ftmval, fty) = self.syn(ctx, fe)?;
//                 let (gtmstx, gtmval, gty) = self.syn(ctx, ge)?;
//                 let ty = match (fty, gty) {
//                     (TyVal::Morphism(fmt, fd, fc), TyVal::Morphism(gmt, gd, gc)) => {
//                         if self.schema.tgt(&fmt) == self.schema.src(&gmt) {
//                             if ctx.env.equal(fc, gd) {
//                                 Some(TyVal::Morphism(
//                                     self.schema.composite2(fmt.clone(), gmt.clone()).unwrap(),
//                                     fd,
//                                     gc,
//                                 ))
//                             } else {
//                                 error!(
//                                     self.at(e),
//                                     "when attempting to compose, could not unify codomain of {} ({}) with domain of {} ({})",
//                                     ctx.quote_tm(&ftmval),
//                                     ctx.quote_id(fc),
//                                     ctx.quote_tm(&gtmval),
//                                     ctx.quote_id(gd)
//                                 )
//                             }
//                         } else {
//                             error!(self.at(e), "mismatching morphism types for composite")
//                         }
//                     }
//                     _ => error!(self.at(e), "can only compose morphisms"),
//                 }?;
//                 Some((
//                     TmStx::Compose(Rc::new(ftmstx), Rc::new(gtmstx)),
//                     ctx.env.compose(ftmval.as_morphism(), gtmval.as_morphism()),
//                     ty,
//                 ))
//             }
//             _ => error!(self.at(e), "unexpected syntax for term"),
//         }
//     }

//     pub fn chk(&self, ctx: &Context, ty: &TyVal, e: &FExp) -> Option<(TmStx, TmVal)> {
//         #[allow(clippy::match_single_binding)]
//         match e.ast0() {
//             _ => {
//                 let (tmstx, tmval, synthed) = self.syn(ctx, e)?;
//                 if ctx.env.convertable_tys(&self.schema, ty, &synthed) {
//                     Some((tmstx, tmval))
//                 } else {
//                     error!(
//                         self.at(e),
//                         "expected term of type {} got {}",
//                         ctx.quote_ty(ty),
//                         ctx.quote_ty(&synthed)
//                     )
//                 }
//             }
//         }
//     }

//     pub fn notebook(&self, notebooks: Rc<dyn NotebookStorage>, e: &FExp) -> Option<Notebook> {
//         let mut ctx = Context::new(notebooks);
//         let mut cells = Vec::new();
//         match e.ast0() {
//             Block(fields, None) => {
//                 for f in fields.iter() {
//                     match f.ast0() {
//                         App2(L(_, Keyword(":")), L(_, Var(name)), ty_expr) => {
//                             let (tystx, tyval) = self.ty(&ctx, ty_expr)?;
//                             let cell = Cell::new(ustr(name), tystx);
//                             ctx.intro(cell.name, tyval);
//                             cells.push(cell);
//                         }
//                         _ => {
//                             return error!(self.at(e), "expected a field");
//                         }
//                     }
//                 }
//             }
//             _ => return error!(self.at(e), "expected a record"),
//         }
//         Some(Notebook::new(cells))
//     }
// }
