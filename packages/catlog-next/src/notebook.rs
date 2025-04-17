use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;
use wasm_bindgen::prelude::*;

use crate::widget_state::WidgetState;

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Cell {
    pub widget: String,
    pub content: WidgetState,
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Metadata {
    pub title: String,
    pub created: DateTime<Utc>,
    pub modified: DateTime<Utc>,
}

impl Metadata {
    fn new() -> Self {
        Metadata {
            title: "Untitled".into(),
            created: Utc::now(),
            modified: Utc::now(),
        }
    }
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Notebook {
    pub metadata: Metadata,
    pub cells: HashMap<Uuid, Cell>,
    pub order: Vec<Uuid>,
}

impl Notebook {
    fn new() -> Self {
        Self {
            metadata: Metadata::new(),
            cells: HashMap::new(),
            order: Vec::new(),
        }
    }
}

#[wasm_bindgen]
pub fn new_notebook() -> Notebook {
    Notebook::new()
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Shelf {
    notebooks: HashMap<Uuid, Notebook>,
    last_opened: Option<Uuid>,
}

#[wasm_bindgen]
pub fn new_shelf() -> Shelf {
    Shelf {
        notebooks: HashMap::new(),
        last_opened: None,
    }
}
