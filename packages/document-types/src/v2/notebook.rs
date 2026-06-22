use crate::v1;

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

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelNotebook(pub Notebook<super::model_judgment::ModelJudgment>);

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiagramNotebook(pub Notebook<super::diagram_judgment::DiagramJudgment>);

/// Arbitrary instances for property-based testing.
#[cfg(feature = "property-tests")]
pub(crate) mod arbitrary {
    use super::*;
    use crate::v2::cell::arbitrary::arb_notebook_cell;
    use proptest::prelude::*;

    fn arb_uuid() -> BoxedStrategy<Uuid> {
        any::<u128>().prop_map(Uuid::from_u128).boxed()
    }

    /// Strategy for a `Notebook<T>` given a strategy for `T`.
    ///
    /// Generates a consistent notebook where `cell_order` contains exactly
    /// the keys in `cell_contents`.
    pub fn arb_notebook<T: std::fmt::Debug + 'static>(
        arb_t: impl Strategy<Value = T> + Clone + 'static,
    ) -> BoxedStrategy<Notebook<T>> {
        prop::collection::vec((arb_uuid(), arb_notebook_cell(arb_t)), 0..6)
            .prop_map(|entries| {
                let mut cell_contents = HashMap::new();
                let mut cell_order = Vec::new();
                for (id, cell) in entries {
                    // Replace the cell's internal id with the map key for
                    // consistency, matching how real notebooks work.
                    let cell = match cell {
                        NotebookCell::RichText { content, .. } => {
                            NotebookCell::RichText { id, content }
                        }
                        NotebookCell::Formal { content, .. } => {
                            NotebookCell::Formal { id, content }
                        }
                    };
                    cell_contents.insert(id, cell);
                    cell_order.push(id);
                }
                Notebook { cell_contents, cell_order }
            })
            .boxed()
    }

    impl Arbitrary for ModelNotebook {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            arb_notebook(any::<super::super::model_judgment::ModelJudgment>())
                .prop_map(ModelNotebook)
                .boxed()
        }
    }
}

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

    /// Migrate a [`v1::Notebook`] to v2 by dropping stem cells.
    ///
    /// Both the cell contents map and the cell order are filtered to remove
    /// stem cells; non-stem cells preserve their UUIDs and ordering.
    pub fn migrate_from_v1(old: v1::Notebook<T>) -> Self {
        let v1::Notebook { cell_contents, cell_order } = old;

        let mut new_contents = HashMap::with_capacity(cell_contents.len());
        for (id, cell) in cell_contents {
            if let Some(new_cell) = NotebookCell::migrate_from_v1(cell) {
                new_contents.insert(id, new_cell);
            }
        }

        // Keep only ids that survived the migration, preserving the original
        // order.
        let new_order: Vec<Uuid> =
            cell_order.into_iter().filter(|id| new_contents.contains_key(id)).collect();

        Notebook {
            cell_contents: new_contents,
            cell_order: new_order,
        }
    }
}
