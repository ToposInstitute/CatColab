use super::cell::NotebookCell;

use serde::{Deserialize, Serialize};

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Notebook<T> {
    pub cells: Vec<NotebookCell<T>>,
}
