use serde::{Deserialize, Serialize};
use tsify::Tsify;
use ustr::Ustr;

/// Object type in a double theory.
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ObType {
    /// Basic or generating object type.
    Basic(Ustr),

    /// Tabulator of a morphism type.
    Tabulator(Box<MorType>),

    /// Modality applied to an object type.
    ModeApp {
        modality: Modality,

        #[serde(rename = "obType")]
        ob_type: Box<ObType>,
    },
}

/// Morphism type in a double theory.
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum MorType {
    /// Basic or generating morphism type.
    Basic(Ustr),

    /// Hom type on an object type.
    Hom(Box<ObType>),

    /// Composite of morphism types.
    Composite(Vec<MorType>),

    /// Modality applied to a morphism type.
    ModeApp {
        modality: Modality,

        #[serde(rename = "morType")]
        mor_type: Box<MorType>,
    },
}

/// Object operation in a double theory.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ObOp {
    /// Basic or generating object operation.
    Basic(Ustr),
}

/// Modality available in a modal double theory.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Modality {
    Discrete,
    Codiscrete,
    List,
    SymmetricList,
    CocartesianList,
    CartesianList,
    AdditiveList,
}

/// Arbitrary instances for property-based testing.
#[cfg(feature = "property-tests")]
pub(crate) mod arbitrary {
    use super::*;
    use proptest::prelude::*;
    use ustr::Ustr;

    /// Strategy for generating an arbitrary `Ustr`.
    pub fn arb_ustr() -> BoxedStrategy<Ustr> {
        "[a-zA-Z_][a-zA-Z0-9_]{0,8}".prop_map(|s| Ustr::from(&s)).boxed()
    }

    impl Arbitrary for Modality {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            proptest::sample::select(&[
                Modality::Discrete,
                Modality::Codiscrete,
                Modality::List,
                Modality::SymmetricList,
                Modality::CocartesianList,
                Modality::CartesianList,
                Modality::AdditiveList,
            ])
            .boxed()
        }
    }

    impl Arbitrary for ObOp {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            arb_ustr().prop_map(ObOp::Basic).boxed()
        }
    }

    /// Strategy for an `ObType` bounded by recursion depth.
    pub fn arb_ob_type(depth: u32) -> BoxedStrategy<ObType> {
        let leaf = arb_ustr().prop_map(ObType::Basic);
        if depth == 0 {
            return leaf.boxed();
        }
        prop_oneof![
            3 => leaf,
            1 => arb_mor_type(depth - 1).prop_map(|m| ObType::Tabulator(Box::new(m))),
            1 => (any::<Modality>(), arb_ob_type(depth - 1))
                .prop_map(|(modality, ob_type)| ObType::ModeApp {
                    modality,
                    ob_type: Box::new(ob_type),
                }),
        ]
        .boxed()
    }

    /// Strategy for a `MorType` bounded by recursion depth.
    pub fn arb_mor_type(depth: u32) -> BoxedStrategy<MorType> {
        let leaf = arb_ustr().prop_map(MorType::Basic);
        if depth == 0 {
            return leaf.boxed();
        }
        prop_oneof![
            3 => leaf,
            1 => arb_ob_type(depth - 1).prop_map(|o| MorType::Hom(Box::new(o))),
            1 => prop::collection::vec(arb_mor_type(depth - 1), 0..3)
                .prop_map(MorType::Composite),
            1 => (any::<Modality>(), arb_mor_type(depth - 1))
                .prop_map(|(modality, mor_type)| MorType::ModeApp {
                    modality,
                    mor_type: Box::new(mor_type),
                }),
        ]
        .boxed()
    }

    impl Arbitrary for ObType {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            arb_ob_type(2).boxed()
        }
    }

    impl Arbitrary for MorType {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            arb_mor_type(2).boxed()
        }
    }
}
