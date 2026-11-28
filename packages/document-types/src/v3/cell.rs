use serde::{Deserialize, Serialize};
use tsify::{Tsify, declare};
use uuid::Uuid;

use crate::v2;

/// A cell in a notebook.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum NotebookCell<T> {
    /// A rich-text cell.
    #[serde(rename = "rich-text")]
    RichText {
        id: Uuid,
        content: super::RichTextContent,
    },
    #[serde(rename = "formal")]
    Formal {
        /// The ID of the cell.
        id: Uuid,
        /// The formal content of the cell.
        content: T,
    },
}

/// Short-hand declaration for readability.
#[declare]
pub type Cell<T> = NotebookCell<T>;

impl<T> NotebookCell<T> {
    /// Migrate a [`v2::NotebookCell`] to v3.
    ///
    /// Note that this is implemented as a special case of `migrate_from_v1_with_generic`.
    pub fn migrate_from_v2(old: v2::NotebookCell<T>) -> Option<Self> {
        Self::migrate_from_v2_with_generic(old, |t| t)
    }

    /// Migrate a [`v2::NotebookCell`] to v3 by updating formal cell contents.
    pub fn migrate_from_v2_with_generic<S>(
        old: v2::NotebookCell<S>,
        update_cell: impl Fn(S) -> T,
    ) -> Option<Self> {
        match old {
            v2::NotebookCell::RichText { id, content } => {
                Some(NotebookCell::RichText { id, content })
            }
            v2::NotebookCell::Formal { id, content } => {
                Some(NotebookCell::Formal { id, content: update_cell(content) })
            }
        }
    }
}

/// Arbitrary instances for property-based testing.
#[cfg(feature = "property-tests")]
pub(crate) mod arbitrary {
    use super::*;
    use crate::v2::rich_text::arbitrary::arb_rich_text;
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
            (arb_uuid(), arb_rich_text())
                .prop_map(|(id, content)| NotebookCell::RichText { id, content }),
            (arb_uuid(), arb_t).prop_map(|(id, content)| NotebookCell::Formal { id, content }),
        ]
        .boxed()
    }
}
