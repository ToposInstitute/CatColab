use crate::v0;
use crate::v0::api::Link;
use std::collections::HashMap;
use uuid::Uuid;

pub struct Document {
    pub metadata: Metadata,
    pub notebook: Notebook,
}

impl Document {
    pub fn new(metadata: Metadata, notebook: Notebook) -> Self {
        Self { metadata, notebook }
    }
}

impl From<v0::document::Document> for Document {
    fn from(value: v0::document::Document) -> Self {
        match value {
            v0::document::Document::Model(doc) => {
                let metadata = Metadata::new(doc.name.clone());
                let notebook = doc.notebook.into();
                Document::new(metadata, notebook)
            }
            v0::document::Document::Diagram(_doc) => todo!(),
            v0::document::Document::Analysis(_doc) => todo!(),
        }
    }
}

pub struct Metadata {
    pub title: String,
    pub description: Option<String>,
    pub authors: Vec<String>,
    pub links: Vec<Link>,
}

impl Metadata {
    pub fn new(title: String) -> Self {
        Self {
            title,
            description: None,
            authors: vec![],
            links: vec![],
        }
    }
}

pub struct Notebook {
    pub content: HashMap<Uuid, Cell>,
    pub order: Vec<Uuid>,
}

impl<T: Into<FormalCell>> From<v0::notebook::Notebook<T>> for Notebook {
    fn from(value: v0::notebook::Notebook<T>) -> Self {
        let mut content = HashMap::new();
        let mut order = Vec::new();
        for v0_cell in value.cells.into_iter() {
            match v0_cell {
                v0::cell::NotebookCell::RichText { id, content: s } => {
                    content.insert(id, Cell::RichText(s));
                    order.push(id);
                }
                v0::cell::NotebookCell::Formal { id, content: c } => {
                    content.insert(id, Cell::Formal(c.into()));
                    order.push(id);
                }
                v0::cell::NotebookCell::Stem { id } => {
                    content.insert(id, Cell::Stem);
                    order.push(id);
                }
            }
        }
        Notebook { content, order }
    }
}

pub enum Cell {
    RichText(String),
    Formal(FormalCell),
    Stem,
}

/// This models a reference to another cell. It supports an unresolved
/// state to model a text field where a name has been entered but not
/// yet resolved to a UUID.
pub enum Reference {
    Unresolved(String),
    Resolved(Uuid),
}

pub enum FormalCell {
    Object {
        name: String,
        r#type: v0::theory::ObType,
    },
    Morphism {
        name: String,
        r#type: v0::theory::MorType,
        dom: Reference,
        cod: Reference,
    },
}

impl From<v0::model::Ob> for Reference {
    fn from(value: v0::model::Ob) -> Self {
        match value {
            v0::Ob::Basic(uuid) => Reference::Resolved(uuid),
            v0::Ob::Tabulated(m) => match m {
                v0::Mor::Basic(uuid) => Reference::Resolved(uuid),
                _ => panic!(
                    "no v0 notebook should contain references to the tabulators of fancy morphisms"
                ),
            },
            _ => todo!(),
        }
    }
}

impl From<v0::model_judgment::ModelJudgment> for FormalCell {
    fn from(value: v0::model_judgment::ModelJudgment) -> Self {
        match value {
            v0::model_judgment::ModelJudgment::Object(v0::model_judgment::ObDecl {
                name,
                ob_type,
                ..
            }) => Self::Object {
                name,
                r#type: ob_type,
            },
            v0::model_judgment::ModelJudgment::Morphism(v0::model_judgment::MorDecl {
                name,
                mor_type,
                dom,
                cod,
                ..
            }) => Self::Morphism {
                name,
                r#type: mor_type,
                dom: dom.map(|x| x.into()).unwrap_or_else(|| Reference::Unresolved(String::new())),
                cod: cod.map(|x| x.into()).unwrap_or_else(|| Reference::Unresolved(String::new())),
            },
            _ => todo!(),
        }
    }
}
