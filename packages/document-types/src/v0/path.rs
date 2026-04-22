use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Path<V, E> {
    Id(V),
    Seq(Vec<E>),
}

/// Arbitrary instances for property-based testing.
#[cfg(feature = "property-tests")]
pub(crate) mod arbitrary {
    use super::*;
    use proptest::prelude::*;

    /// Strategy for a `Path<V, E>` given strategies for vertices and edges.
    pub fn arb_path<V: std::fmt::Debug + 'static, E: std::fmt::Debug + 'static>(
        arb_v: impl Strategy<Value = V> + 'static,
        arb_e: impl Strategy<Value = E> + 'static,
    ) -> BoxedStrategy<Path<V, E>> {
        prop_oneof![
            arb_v.prop_map(Path::Id),
            prop::collection::vec(arb_e, 0..3).prop_map(Path::Seq),
        ]
        .boxed()
    }
}
