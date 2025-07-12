use js_sys::Array;
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use std::{cell::RefCell, collections::HashMap, rc::Rc};

use ::notebook_types::v0::{ModelJudgment, notebook};
use catlog::{
    dbl::{
        category::VDblCategory,
        model::{DiscreteDblModel, UstrDiscreteDblModel},
        theory::UstrDiscreteDblTheory,
    },
    one::{FgCategory, FpCategory, Path, UstrFpCategory},
};
use catlog_wasm::theory::DblTheory;
use notebook_types::current::{self as notebook_types};
use ustr::{Ustr, ustr};
use uuid::Uuid;
use web_sys::console;

use crate::{
    eval::{Env, NotebookStorage, State, TmVal, TyVal},
    name::{QualifiedName, Segment},
    syntax::{Cell, Lvl, Notebook, NotebookRef, ObType, TmStx, TyStx},
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
    NoSuchNotebook(String),
}

use ElaborationErrorContent::*;

#[derive(Debug)]
struct ElaborationError {
    cell: Option<Uuid>,
    content: ElaborationErrorContent,
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Notebooks(HashMap<String, notebook_types::ModelDocumentContent>);

#[derive(Clone)]
pub struct ElaborationCache {
    notebooks: Rc<Notebooks>,
    elaborated: Rc<RefCell<HashMap<String, Rc<Notebook>>>>,
    elaborator: NotebookElaborator,
}

impl NotebookStorage for ElaborationCache {
    fn lookup(&self, id: &str) -> Option<Rc<Notebook>> {
        if let Some(nb) = self.elaborated.borrow().get(id) {
            return Some(nb.clone());
        } else if let Some(raw) = self.notebooks.0.get(id) {
            if let Some(nb) = self.elaborator.notebook(self.clone(), &raw.notebook) {
                let nbrc = Rc::new(nb);
                self.elaborated.borrow_mut().insert(id.to_string(), nbrc.clone());
                return Some(nbrc);
            }
        }
        None
    }
}

impl ElaborationCache {
    pub fn new(notebooks: Notebooks, theory: Rc<UstrDiscreteDblTheory>) -> Self {
        Self {
            notebooks: Rc::new(notebooks),
            elaborated: Rc::new(RefCell::new(HashMap::new())),
            elaborator: NotebookElaborator::new(theory),
        }
    }
}

#[derive(Clone)]
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
    fn new(cache: ElaborationCache, theory: Rc<UstrDiscreteDblTheory>) -> Self {
        Self {
            scope: Vec::new(),
            env: State::empty(Rc::new(cache), theory).new_env(),
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
        let i = self.scope.len();
        let at = QualifiedName::singleton(Segment::new(i).with_id(uuid).set_name(name));
        let val = self.env.intro(at, &ty);
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

    pub fn notebook(
        &self,
        cache: ElaborationCache,
        raw: &notebook::Notebook<ModelJudgment>,
    ) -> Option<Notebook> {
        let mut cells = Vec::new();
        let mut ctx = Context::new(cache.clone(), self.theory.clone());
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
                Record(record_decl) => {
                    let Some(_) = cache.lookup(&record_decl.notebook_id) else {
                        let _: Option<()> =
                            self.error(NoSuchNotebook(record_decl.notebook_id.to_string()));
                        continue;
                    };
                    let nbref = NotebookRef {
                        id: ustr(&record_decl.notebook_id),
                    };
                    let tyval = TyVal::Notebook(nbref);
                    let tystx = TyStx::Notebook(nbref);
                    ctx.intro(record_decl.id, Some(ustr(&record_decl.name)), tyval);
                    cells.push(Cell::new(ustr(&record_decl.name), tystx))
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
pub struct DblModelNext(Box<DiscreteDblModel<QualifiedName, UstrFpCategory>>);

// #[wasm_bindgen]
// impl DblModelNext {
//     /// Is the object contained in the model?
//     #[wasm_bindgen(js_name = "hasOb")]
//     pub fn has_ob(&self, ob: Ob) -> Result<bool, String> {
//         todo!()
//     }

//     /// Is the morphism contained in the model?
//     #[wasm_bindgen(js_name = "hasMor")]
//     pub fn has_mor(&self, mor: Mor) -> Result<bool, String> {
//         all_the_same!(match &self.0 {
//             DblModelBox::[Discrete, DiscreteTab](model) => {
//                 let mor = Elaborator.elab(&mor)?;
//                 Ok(model.has_mor(&mor))
//             }
//         })
//     }

//     /// Returns array of all basic objects in the model.
//     #[wasm_bindgen]
//     pub fn objects(&self) -> Vec<Ob> {
//         all_the_same!(match &self.0 {
//             DblModelBox::[Discrete, DiscreteTab](model) => model.objects().map(|x| Quoter.quote(&x)).collect()
//         })
//     }

//     /// Returns array of all basic morphisms in the model.
//     #[wasm_bindgen]
//     pub fn morphisms(&self) -> Vec<Mor> {
//         all_the_same!(match &self.0 {
//             DblModelBox::[Discrete, DiscreteTab](model) => model.morphisms().map(|f| Quoter.quote(&f)).collect()
//         })
//     }

//     /// Returns array of basic objects with the given type.
//     #[wasm_bindgen(js_name = "objectsWithType")]
//     pub fn objects_with_type(&self, ob_type: ObType) -> Result<Vec<Ob>, String> {
//         all_the_same!(match &self.0 {
//             DblModelBox::[Discrete, DiscreteTab](model) => {
//                 let ob_type = Elaborator.elab(&ob_type)?;
//                 Ok(model.objects_with_type(&ob_type).map(|ob| Quoter.quote(&ob)).collect())
//             }
//         })
//     }

//     /// Returns array of basic morphisms with the given type.
//     #[wasm_bindgen(js_name = "morphismsWithType")]
//     pub fn morphisms_with_type(&self, mor_type: MorType) -> Result<Vec<Mor>, String> {
//         all_the_same!(match &self.0 {
//             DblModelBox::[Discrete, DiscreteTab](model) => {
//                 let mor_type = Elaborator.elab(&mor_type)?;
//                 Ok(model.morphisms_with_type(&mor_type).map(|mor| Quoter.quote(&mor)).collect())
//             }
//         })
//     }

//     pub fn validate(&self) -> ModelValidationResult {
//         all_the_same!(match &self.0 {
//             DblModelBox::[Discrete, DiscreteTab](model) => {
//                 let res = model.validate();
//                 ModelValidationResult(res.map_err(|errs| errs.into()).into())
//             }
//         })
//     }
// }

#[wasm_bindgen]
pub fn elaborate(notebooks: Notebooks, notebook_id: String, theory: &DblTheory) {
    let theory = match &theory.0 {
        catlog_wasm::theory::DblTheoryBox::Discrete(t) => t,
        catlog_wasm::theory::DblTheoryBox::DiscreteTab(_) => panic!("tabulators unsupported"),
    };
    let cache = ElaborationCache::new(notebooks, theory.clone());
    let res = cache.lookup(&notebook_id);
    if let Some(nb) = res {
        let state = State::empty(Rc::new(cache), theory.clone());
        let evaluator = state.new_env();
        evaluator.intro_notebook(&QualifiedName::empty(), &nb);
        console::log_1(
            &format!(
                "{:?}",
                state
                    .neutrals
                    .borrow()
                    .ob_generators()
                    .map(|id| format!("{}", id))
                    .collect::<Vec<_>>()
            )
            .into(),
        );
        // TODO: shouldn't need a clone here
        // Some(DblModelNext(Box::new(DiscreteDblModel::clone(&state.neutrals.borrow()))))
    } else {
        // None
    }
}
