use wasm_bindgen::prelude::*;

use std::{cell::RefCell, rc::Rc};

use ::notebook_types::v0::{ModelJudgment, notebook};
use catlog::{
    dbl::{category::VDblCategory, theory::UstrDiscreteDblTheory},
    one::Path,
};
use catlog_wasm::theory::DblTheory;
use notebook_types::current::{self as notebook_types};
use ustr::{Ustr, ustr};
use uuid::Uuid;
use web_sys::console;

use crate::{
    eval::{Env, State, TmVal, TyVal},
    syntax::{Cell, Lvl, Notebook, ObType, TmStx, TyStx},
    toplevel::Toplevel,
};

#[derive(Debug)]
pub enum ElaborationErrorContent {
    TabulatorUnsupported,
    IncompleteCell,
    NoSuchObjectType(Ustr),
    NoSuchMorphismType(Path<Ustr, Ustr>),
    UuidNotFound(Uuid),
    ExpectedObjectForUuid(Uuid),
    MismatchingObTypes(ObType, ObType),
}

use ElaborationErrorContent::*;

#[derive(Debug)]
struct ElaborationError {
    cell: Option<Uuid>,
    content: ElaborationErrorContent,
}

pub struct NotebookElaborator {
    errors: Rc<RefCell<Vec<ElaborationError>>>,
    theory: Rc<UstrDiscreteDblTheory>,
    current_cell_id: Option<Uuid>,
}

pub struct Context {
    scope: Vec<(Uuid, Option<Ustr>, TyVal)>,
    env: Env,
}

impl Context {
    fn new() -> Self {
        Self {
            scope: Vec::new(),
            env: State::empty(Rc::new(Toplevel::new())).new_env(),
        }
    }

    fn lookup(&self, uuid: &Uuid) -> Option<(Lvl, TyVal)> {
        self.scope
            .iter()
            .enumerate()
            .find(|(_, (uuid1, _, _))| uuid == uuid1)
            .map(|(i, (_, name, ty))| (Lvl::new(i, *name), ty.clone()))
    }

    fn intro(&mut self, uuid: Uuid, name: Option<Ustr>, ty: TyVal) {
        let val = self.env.intro(&ty);
        self.env.values.push(val);
        self.scope.push((uuid, name, ty));
    }
}

impl NotebookElaborator {
    fn new(theory: Rc<UstrDiscreteDblTheory>) -> Self {
        Self {
            errors: Rc::new(RefCell::new(Vec::new())),
            theory,
            current_cell_id: None,
        }
    }

    fn error<T>(&self, error: ElaborationErrorContent) -> Option<T> {
        self.errors.borrow_mut().push(ElaborationError {
            cell: self.current_cell_id,
            content: error,
        });
        None
    }

    fn object_ty(&self, ob_decl: &notebook_types::ObDecl) -> Option<(TyStx, TyVal)> {
        match &ob_decl.ob_type {
            notebook_types::ObType::Basic(ob_type) => {
                if !self.theory.has_ob(ob_type) {
                    return self.error(NoSuchObjectType(*ob_type));
                }
                Some((TyStx::Object(*ob_type), TyVal::Object(*ob_type)))
            }
            notebook_types::ObType::Tabulator(_mor_type) => self.error(TabulatorUnsupported),
        }
    }

    fn syn_object(&self, ctx: &Context, ob: &notebook_types::Ob) -> Option<(TmStx, TmVal, ObType)> {
        match ob {
            notebook_types::Ob::Basic(uuid) => {
                let (l, ty) = ctx.lookup(uuid).or_else(|| self.error(UuidNotFound(*uuid)))?;
                let val = ctx.env.get(l);
                let ob_type = match ty {
                    TyVal::Object(ustr) => ustr,
                    _ => return self.error(ExpectedObjectForUuid(*uuid)),
                };
                Some((TmStx::Var(l), val, ob_type))
            }
            notebook_types::Ob::Tabulated(_mor) => self.error(TabulatorUnsupported),
        }
    }

    fn chk_object(
        &self,
        ctx: &Context,
        ob_type: ObType,
        ob: &notebook_types::Ob,
    ) -> Option<(TmStx, TmVal)> {
        let (obstx, obval, synthed) = self.syn_object(ctx, ob)?;
        if synthed != ob_type {
            self.error(MismatchingObTypes(ob_type, synthed))
        } else {
            Some((obstx, obval))
        }
    }

    fn morphism_ty(
        &self,
        ctx: &Context,
        mor_decl: &notebook_types::MorDecl,
    ) -> Option<(TyStx, TyVal)> {
        let over = match &mor_decl.mor_type {
            notebook_types::MorType::Basic(ustr) => Path::single(*ustr),
            notebook_types::MorType::Hom(ob_type) => Path::empty(ob_type.as_basic()),
        };
        if !self.theory.has_proarrow(&over) {
            return self.error(NoSuchMorphismType(over));
        }
        let dom_res = self.chk_object(
            ctx,
            self.theory.src(&over),
            mor_decl.dom.as_ref().or_else(|| self.error(IncompleteCell))?,
        );
        let cod_res = self.chk_object(
            ctx,
            self.theory.tgt(&over),
            mor_decl.cod.as_ref().or_else(|| self.error(IncompleteCell))?,
        );
        let (domstx, domval) = dom_res?;
        let (codstx, codval) = cod_res?;
        Some((
            TyStx::Morphism(over.clone(), domstx, codstx),
            TyVal::Morphism(over.clone(), domval.as_object(), codval.as_object()),
        ))
    }

    pub fn notebook(&self, raw: &notebook::Notebook<ModelJudgment>) -> Option<Notebook> {
        let mut cells = Vec::new();
        let mut ctx = Context::new();
        for raw_cell in raw.cells.iter() {
            use notebook_types::NotebookCell::*;
            let content = match raw_cell {
                Formal { id: _, content } => content,
                _ => continue,
            };
            use notebook_types::ModelJudgment::*;
            match content {
                Object(ob_decl) => {
                    let Some((tystx, tyval)) = self.object_ty(ob_decl) else {
                        continue;
                    };
                    ctx.intro(ob_decl.id, Some(ustr(&ob_decl.name)), tyval);
                    cells.push(Cell::new(ustr(&ob_decl.name), tystx))
                }
                Morphism(mor_decl) => {
                    let Some((tystx, tyval)) = self.morphism_ty(&ctx, mor_decl) else {
                        continue;
                    };
                    ctx.intro(mor_decl.id, Some(ustr(&mor_decl.name)), tyval);
                    cells.push(Cell::new(ustr(&mor_decl.name), tystx))
                }
            }
        }

        if self.errors.borrow().len() == 0 {
            Some(Notebook::new(cells))
        } else {
            None
        }
    }
}

#[wasm_bindgen]
pub fn elaborate(raw: &notebook_types::ModelDocumentContent, theory: &DblTheory) {
    let theory = match &theory.0 {
        catlog_wasm::theory::DblTheoryBox::Discrete(t) => t,
        catlog_wasm::theory::DblTheoryBox::DiscreteTab(_) => panic!("tabulators unsupported"),
    };
    let elab = NotebookElaborator::new(theory.clone());
    let res = elab.notebook(&raw.notebook);
    console::log_1(&format!("{:?}", elab.errors.borrow()).into());
    console::log_1(&format!("{:?}", res).into())
}
