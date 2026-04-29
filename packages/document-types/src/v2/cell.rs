use serde::{Deserialize, Serialize};
use tsify::{Tsify, declare};
use uuid::Uuid;

use crate::v1;

/// A cell in a notebook.
///
/// Unlike [`v1::NotebookCell`], stem cells (placeholders awaiting a chosen
/// type) are no longer part of the data model.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum NotebookCell<T> {
    #[serde(rename = "rich-text")]
    RichText { id: Uuid, content: String },
    #[serde(rename = "formal")]
    Formal { id: Uuid, content: T },
}

#[declare]
pub type Cell<T> = NotebookCell<T>;

impl<T> NotebookCell<T> {
    /// Migrate a [`v1::NotebookCell`] to v2.
    ///
    /// Stem cells are no longer representable, so attempting to migrate one
    /// returns `None`. Callers are expected to drop such cells from the
    /// containing notebook.
    pub fn migrate_from_v1(old: v1::NotebookCell<T>) -> Option<Self> {
        match old {
            v1::NotebookCell::RichText { id, content } => {
                Some(NotebookCell::RichText { id, content })
            }
            v1::NotebookCell::Formal { id, content } => Some(NotebookCell::Formal { id, content }),
            v1::NotebookCell::Stem { .. } => None,
        }
    }
}

/// Arbitrary instances for property-based testing.
#[cfg(feature = "property-tests")]
pub(crate) mod arbitrary {
    use super::*;
    use proptest::prelude::*;
    use uuid::Uuid;

    fn arb_uuid() -> BoxedStrategy<Uuid> {
        any::<u128>().prop_map(Uuid::from_u128).boxed()
    }

    /// Strategy for a `NotebookCell<T>` given a strategy for `T`.
    pub fn arb_notebook_cell<T: std::fmt::Debug + 'static>(
        arb_t: impl Strategy<Value = T> + Clone + 'static,
    ) -> BoxedStrategy<NotebookCell<T>> {
        prop_oneof![
            (arb_uuid(), any::<String>())
                .prop_map(|(id, content)| NotebookCell::RichText { id, content }),
            (arb_uuid(), arb_t).prop_map(|(id, content)| NotebookCell::Formal { id, content }),
        ]
        .boxed()
    }
}
