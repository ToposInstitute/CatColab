use serde::{Deserialize, Serialize};
use tsify::{Tsify, declare};
use uuid::Uuid;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum NotebookCell<T> {
    #[serde(rename = "rich-text")]
    RichText { id: Uuid, content: String },
    #[serde(rename = "formal")]
    Formal { id: Uuid, content: T },
    #[serde(rename = "stem")]
    Stem { id: Uuid },
}

#[declare]
pub type Cell<T> = NotebookCell<T>;

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
            arb_uuid().prop_map(|id| NotebookCell::Stem { id }),
        ]
        .boxed()
    }
}
