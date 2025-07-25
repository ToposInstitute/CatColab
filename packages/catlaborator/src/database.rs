use catlog_wasm::theory::DblTheory;
use serde::{Deserialize, Serialize};
use std::fmt::Write;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use std::{cell::RefCell, collections::HashMap, rc::Rc};

use ::notebook_types::v0::ModelDocumentContent;
use catlog::{
    dbl::{model::DiscreteDblModel, theory::UstrDiscreteDblTheory},
    one::{FgCategory, Path, UstrFpCategory},
    zero::name::QualifiedName,
};
use notebook_types::current::{self as notebook_types};
use ustr::Ustr;
use uuid::Uuid;

use crate::{
    eval::{ClassLibrary, State},
    notebook_elab,
    syntax::*,
};

pub type RefId = String;

#[derive(Serialize, Deserialize, Tsify, Clone, Hash, PartialEq, Eq)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct AutomergeHeads(Vec<String>);

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

#[derive(Debug)]
pub struct ElaborationError {
    pub cell: Option<Uuid>,
    pub content: ElaborationErrorContent,
}

pub enum Source {
    CatColab(ModelDocumentContent),
}

pub struct ElaborationResult {
    class: Rc<ClassStx>,
    errors: Vec<ElaborationError>,
}

// TODO: better name?
pub struct ClassData {
    source: Source,
    theory: Rc<UstrDiscreteDblTheory>,
    // TODO: use more general freshness indicator than automerge heads
    heads: AutomergeHeads,
    elaborated: Option<ElaborationResult>,
}

#[derive(Clone)]
#[wasm_bindgen]
pub struct ElaborationDatabase {
    content: Rc<RefCell<HashMap<RefId, ClassData>>>,
}

#[wasm_bindgen]
pub struct DblModelNext {
    model: DiscreteDblModel<QualifiedName, UstrFpCategory>,
}

impl DblModelNext {
    pub fn new(model: DiscreteDblModel<QualifiedName, UstrFpCategory>) -> Self {
        DblModelNext { model }
    }
}

#[wasm_bindgen]
impl DblModelNext {
    #[wasm_bindgen]
    pub fn show(&self) -> String {
        let mut out = String::new();
        for ob in self.model.ob_generators() {
            writeln!(&mut out, "{}", ob).unwrap();
        }
        for mor in self.model.mor_generators() {
            writeln!(&mut out, "{}", mor).unwrap();
        }
        out
    }
}

#[wasm_bindgen]
impl ElaborationDatabase {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            content: Rc::new(RefCell::new(HashMap::new())),
        }
    }

    #[wasm_bindgen(js_name = "contains")]
    pub fn contains(&self, r: RefId, heads: AutomergeHeads) -> bool {
        self.content.borrow().get(&r).map(|d| &d.heads == &heads).unwrap_or(false)
    }

    #[wasm_bindgen(js_name = "insertNotebook")]
    pub fn insert_notebook(
        &self,
        r: RefId,
        heads: AutomergeHeads,
        theory: &DblTheory,
        notebook: notebook_types::ModelDocumentContent,
    ) {
        let theory = match &theory.0 {
            catlog_wasm::theory::DblTheoryBox::Discrete(discrete_dbl_theory) => {
                discrete_dbl_theory.clone()
            }
            catlog_wasm::theory::DblTheoryBox::DiscreteTab(_discrete_tab_theory) => {
                panic!("tabulators not yet supported")
            }
        };
        self.content.borrow_mut().insert(
            r,
            ClassData {
                source: Source::CatColab(notebook),
                theory,
                heads,
                elaborated: None,
            },
        );
    }

    #[wasm_bindgen(js_name = "createModel")]
    pub fn create_model(&self, r: RefId) -> Option<DblModelNext> {
        let class = self.lookup(&r)?;
        let theory = self.content.borrow().get(&r).unwrap().theory.clone();
        let state = State::empty(Rc::new(self.clone()), theory.clone());
        state.new_env().intro_class(&QualifiedName::empty(), &class);
        Some(DblModelNext::new(state.neutrals.replace(DiscreteDblModel::new(theory.clone()))))
    }
}

impl ClassLibrary for ElaborationDatabase {
    fn lookup<'a>(&'a self, id: &str) -> Option<Rc<ClassStx>> {
        if let Some(class_data) = self.content.borrow_mut().get_mut(id) {
            if let Some(elaborated) = &class_data.elaborated {
                Some(elaborated.class.clone())
            } else {
                let elaborator = notebook_elab::Elaborator::new(class_data.theory.clone());
                let notebook = match &class_data.source {
                    Source::CatColab(model_document_content) => &model_document_content.notebook,
                };
                if let Some(class) = elaborator.class(self.clone(), notebook) {
                    let class = Rc::new(class);
                    // TODO: we should always elaborate *some* class, possibly
                    // with no members
                    class_data.elaborated = Some(ElaborationResult {
                        class: class.clone(),
                        errors: elaborator.report(),
                    });
                    Some(class)
                } else {
                    None
                }
            }
        } else {
            None
        }
    }
}
