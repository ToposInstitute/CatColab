use catlog::stdlib::th_signed_category;
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, collections::HashMap, rc::Rc};
use tattle::{Reporter, reporter::Message};
use tsify::{Tsify, declare};
use ustr::ustr;
use wasm_bindgen::prelude::*;

use crate::{
    elab::{Context, Elaborator},
    eval::{NotebookStorage, TyVal},
    syntax::{Cell, Notebook, NotebookRef, TyStx},
    toplevel::PARSE_CONFIG,
};

#[declare]
pub type DocumentId = String;
#[declare]
pub type Uuid = String;

#[derive(Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum RawCellType {
    String { value: String },
    Notebook { value: DocumentId },
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct RawCell {
    name: Option<String>,
    ty: RawCellType,
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)]
pub struct RawNotebook {
    title: String,
    #[serde(rename = "cellContent")]
    cell_content: HashMap<Uuid, RawCell>,
    order: Vec<Uuid>,
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Database {
    notebooks: HashMap<DocumentId, RawNotebook>,
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ErrorMessage {
    pos: Option<(usize, usize)>,
    message: String,
}

impl From<tattle::reporter::Message> for ErrorMessage {
    fn from(value: tattle::reporter::Message) -> Self {
        match value {
            Message::Error(error) => ErrorMessage {
                pos: error.loc.map(|l| (l.start, l.end)),
                message: error.message,
            },
            Message::Info(m) => ErrorMessage {
                pos: None,
                message: m,
            },
        }
    }
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ElaborationResult {
    errors: HashMap<Uuid, Vec<ErrorMessage>>,
}

impl ElaborationResult {
    pub fn new(errors: HashMap<Uuid, Vec<ErrorMessage>>) -> Self {
        Self { errors }
    }
}

#[derive(Clone)]
struct NotebookCache {
    raw_notebooks: Rc<HashMap<DocumentId, RawNotebook>>,
    notebooks: Rc<RefCell<HashMap<DocumentId, Rc<Notebook>>>>,
    feedback: Rc<RefCell<HashMap<DocumentId, ElaborationResult>>>,
}

impl NotebookCache {
    fn new(raw_notebooks: HashMap<DocumentId, RawNotebook>) -> Self {
        Self {
            raw_notebooks: Rc::new(raw_notebooks),
            notebooks: Rc::new(RefCell::new(HashMap::new())),
            feedback: Rc::new(RefCell::new(HashMap::new())),
        }
    }
}

impl NotebookStorage for NotebookCache {
    fn lookup(&self, id: &str) -> Option<Rc<Notebook>> {
        if let Some(nb) = self.notebooks.borrow().get(id) {
            return Some(nb.clone());
        }
        let reporter = Reporter::new();
        let elab = Elaborator::new(reporter.clone(), Rc::new(th_signed_category()));
        if let Some(raw_nb) = self.raw_notebooks.get(id) {
            let mut ctx = Context::new(Rc::new(self.clone()));
            let mut cells = Vec::new();
            let mut errors = HashMap::new();
            for cell_id in raw_nb.order.iter() {
                let content = raw_nb.cell_content.get(cell_id).unwrap();
                let Some((tystx, tyval)) = (match &content.ty {
                    RawCellType::String { value: s } => {
                        let res =
                            PARSE_CONFIG.with_parsed(s, reporter.clone(), |e| elab.ty(&mut ctx, e));
                        errors.insert(
                            cell_id.clone(),
                            reporter.poll().into_iter().map(|m| m.into()).collect(),
                        );
                        res
                    }
                    RawCellType::Notebook { value: id } => {
                        if let Some(_) = self.lookup(&id) {
                            let nbref = NotebookRef { id: ustr(&id) };
                            errors.insert(cell_id.clone(), Vec::new());
                            Some((TyStx::Notebook(nbref), TyVal::Notebook(nbref)))
                        } else {
                            errors.insert(
                                cell_id.clone(),
                                vec![ErrorMessage {
                                    pos: None,
                                    message: "could not find notebook with that id".to_string(),
                                }],
                            );
                            None
                        }
                    }
                }) else {
                    continue;
                };
                let name = content.name.as_ref().map(|n| ustr(&n)).unwrap_or(ustr("_"));
                cells.push(Cell::new(name, tystx));
                ctx.intro(name, tyval);
            }
            let nb = Rc::new(Notebook::new(cells));
            self.notebooks.borrow_mut().insert(id.to_string(), nb.clone());
            self.feedback
                .borrow_mut()
                .insert(id.to_string(), ElaborationResult::new(errors));
            return Some(nb);
        }
        None
    }
}

#[wasm_bindgen]
pub fn elaborate(database: Database, document_id: DocumentId) -> ElaborationResult {
    let cache = NotebookCache::new(database.notebooks);
    cache.lookup(&document_id);
    cache.feedback.take().remove(&document_id).unwrap()
}
