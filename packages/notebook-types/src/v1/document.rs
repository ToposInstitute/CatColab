use crate::v0::api::Link;
use std::collections::HashMap;
use uuid::Uuid;

pub struct Document {
    pub metadata: Metadata,
    pub notebook: Notebook,
}

pub struct Metadata {
    pub title: String,
    pub description: String,
    pub authors: Vec<String>,
    pub links: Vec<Link>,
}

pub struct Notebook {
    pub content: HashMap<Uuid, Cell>,
    pub order: Vec<Uuid>,
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
        r#type: Reference,
    },
    Morphism {
        name: String,
        r#type: Reference,
        dom: Reference,
        cod: Reference,
    },
}
