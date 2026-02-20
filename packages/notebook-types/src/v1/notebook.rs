use crate::v0;

use super::cell::NotebookCell;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tsify::Tsify;
use uuid::Uuid;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)]
pub struct Notebook<T> {
    #[serde(rename = "cellContents")]
    pub cell_contents: HashMap<Uuid, NotebookCell<T>>,
    #[serde(rename = "cellOrder")]
    pub cell_order: Vec<Uuid>,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct ModelNotebook(pub Notebook<super::model_judgment::ModelJudgment>);

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
#[allow(dead_code)] //should probably delete
pub struct DiagramNotebook(pub Notebook<super::diagram_judgment::DiagramJudgment>);

impl<T> Notebook<T> {
    pub fn cells(&self) -> impl Iterator<Item = &NotebookCell<T>> {
        self.cell_order.iter().filter_map(|id| self.cell_contents.get(id))
    }

    pub fn formal_content(&self) -> impl Iterator<Item = &T> {
        self.cells().filter_map(|cell| match cell {
            NotebookCell::Formal { content, .. } => Some(content),
            _ => None,
        })
    }

    pub fn migrate_from_v0(old: v0::Notebook<T>) -> Self {
        let mut cell_contents = HashMap::new();
        let mut cell_order = Vec::new();

        for old_cell in old.cells {
            let id = match old_cell {
                v0::NotebookCell::RichText { id, .. }
                | v0::NotebookCell::Formal { id, .. }
                | v0::NotebookCell::Stem { id } => id,
            };

            cell_order.push(id);
            cell_contents.insert(id, old_cell);
        }

        Notebook { cell_contents, cell_order }
    }
}
