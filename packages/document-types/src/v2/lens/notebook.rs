use crate::v0::model_judgment::ModelJudgment;
use crate::v2::cell::NotebookCell;
use crate::v2::lens::{
    FormalContent, FormalContentChange, FormalContentDelta, FormalContentDeltaLens,
};
use crate::v2::notebook::Notebook;

impl FormalContentDeltaLens for Notebook<ModelJudgment> {
    fn to_formal_content(&self) -> FormalContent {
        // We perform no filtering here, as this is intended to be a generic
        // delta lens implementation.
        self.formal_content().cloned().collect()
    }

    fn apply_delta(&mut self, delta: &FormalContentDelta) {
        // Notebook<ModelJudgement> is very close to FormalContent already,
        // there's little to do.
        for change in delta {
            match change {
                FormalContentChange::Upsert(jgmt) => {
                    let id = jgmt.id();
                    let cell = NotebookCell::Formal { id, content: jgmt.clone() };
                    if !self.cell_contents.contains_key(&id) {
                        self.cell_order.push(id);
                    }
                    self.cell_contents.insert(id, cell);
                }
                FormalContentChange::Remove(id) => {
                    self.cell_contents.remove(id);
                    self.cell_order.retain(|i| i != id);
                }
            }
        }
    }
}
