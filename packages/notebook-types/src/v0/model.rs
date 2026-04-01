use serde::{Deserialize, Serialize};
use tsify::Tsify;

use super::{path::Path, theory::*};

/// An object in a model of a double theory.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub enum Ob {
    /// Basic or generating object.
    Basic(String),

    /// Application of an object operation to another object.
    App { op: ObOp, ob: Box<Ob> },

    /// List of objects, each possibly ill-defined, in a list modality.
    List {
        modality: Modality,
        objects: Vec<Option<Ob>>,
    },

    /// Morphism viewed as an object of a tabulator.
    Tabulated(Mor),
}

/// A morphism in a model of a double theory.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Mor {
    /// Basic or generating morphism.
    Basic(String),

    /// Composite of morphisms.
    Composite(Box<Path<Ob, Mor>>),

    /// Morphism between tabulated morphisms, a commutative square.
    TabulatorSquare {
        dom: Box<Mor>,
        cod: Box<Mor>,
        pre: Box<Mor>,
        post: Box<Mor>,
    },
}

/// Arbitrary instances for property-based testing.
#[cfg(feature = "property-tests")]
pub(crate) mod arbitrary {
    use super::*;
    use crate::v0::path::arbitrary::arb_path;
    use proptest::prelude::*;

    /// Strategy for an `Ob` bounded by recursion depth.
    pub fn arb_ob(depth: u32) -> BoxedStrategy<Ob> {
        let leaf = any::<String>().prop_map(Ob::Basic);
        if depth == 0 {
            return leaf.boxed();
        }
        prop_oneof![
            3 => leaf,
            1 => (any::<ObOp>(), arb_ob(depth - 1))
                .prop_map(|(op, ob)| Ob::App { op, ob: Box::new(ob) }),
            1 => (any::<Modality>(), prop::collection::vec(
                    proptest::option::of(arb_ob(depth - 1)), 0..3))
                .prop_map(|(modality, objects)| Ob::List { modality, objects }),
            1 => arb_mor(depth - 1).prop_map(Ob::Tabulated),
        ]
        .boxed()
    }

    /// Strategy for a `Mor` bounded by recursion depth.
    pub fn arb_mor(depth: u32) -> BoxedStrategy<Mor> {
        let leaf = any::<String>().prop_map(Mor::Basic);
        if depth == 0 {
            return leaf.boxed();
        }
        prop_oneof![
            3 => leaf,
            1 => arb_path(arb_ob(depth - 1), arb_mor(depth - 1))
                .prop_map(|p| Mor::Composite(Box::new(p))),
            1 => (arb_mor(depth - 1), arb_mor(depth - 1),
                   arb_mor(depth - 1), arb_mor(depth - 1))
                .prop_map(|(dom, cod, pre, post)| Mor::TabulatorSquare {
                    dom: Box::new(dom),
                    cod: Box::new(cod),
                    pre: Box::new(pre),
                    post: Box::new(post),
                }),
        ]
        .boxed()
    }

    impl Arbitrary for Ob {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            arb_ob(2).boxed()
        }
    }

    impl Arbitrary for Mor {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            arb_mor(2).boxed()
        }
    }
}
