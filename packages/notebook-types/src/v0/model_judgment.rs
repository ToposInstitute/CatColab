use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::api::Link;
use super::model::{Mor, Ob};
use super::theory::{MorType, ObType};

/// Declares an object in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct ObDecl {
    /// Human-readable label for object.
    pub name: String,

    /// Globally unique identifier of object.
    pub id: Uuid,

    /// The object's type in the double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,
}

/// Declares a morphism in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MorDecl {
    /// Human-readable label for morphism.
    pub name: String,

    /// Globally unique identifier of morphism.
    pub id: Uuid,

    /// The morphism's type in the double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Domain of morphism, if defined.
    pub dom: Option<Ob>,

    /// Codomain of morphism, if defined.
    pub cod: Option<Ob>,
}

/// Instantiates an existing model into the current model.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct InstantiatedModel {
    /// Human-readable label for the instantiation.
    pub name: String,

    /// Globally unique identifer of the instantiation.
    pub id: Uuid,

    /// Link to the model to instantiate.
    pub model: Option<Link>,

    /// List of specializations to perform on the instantiated model.
    pub specializations: Vec<SpecializeModel>,
}

/// A specialization of a generating object in an instantiated model.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct SpecializeModel {
    /// ID (qualified name) of generating object to specialize.
    pub id: Option<String>,

    /// Object to insert as the specialization.
    pub ob: Option<Ob>,
}

/// Declares an equation in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct EqnDecl {
    /// Human-readable label for equation.
    pub name: String,

    /// Globally unique identifier of equation.
    pub id: Uuid,

    /// The left-hand side of the equation, if defined.
    pub lhs: Option<Mor>,

    /// The right-hand side of the equation, if defined.
    pub rhs: Option<Mor>,
}

/// A judgment defining part of a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ModelJudgment {
    /// Declares a generating object of the model.
    #[serde(rename = "object")]
    Object(ObDecl),

    /// Declares a generating morphism of the model.
    #[serde(rename = "morphism")]
    Morphism(MorDecl),

    /// Declares an equation between two morphisms in the model.
    #[serde(rename = "equation")]
    Equation(EqnDecl),

    /// Instantiates an existing model into this model.
    #[serde(rename = "instantiation")]
    Instantiation(InstantiatedModel),
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

    impl Arbitrary for ObDecl {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            (any::<String>(), arb_uuid(), any::<ObType>())
                .prop_map(|(name, id, ob_type)| ObDecl { name, id, ob_type })
                .boxed()
        }
    }

    impl Arbitrary for MorDecl {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            (
                any::<String>(),
                arb_uuid(),
                any::<MorType>(),
                proptest::option::of(any::<Ob>()),
                proptest::option::of(any::<Ob>()),
            )
                .prop_map(|(name, id, mor_type, dom, cod)| MorDecl { name, id, mor_type, dom, cod })
                .boxed()
        }
    }

    impl Arbitrary for SpecializeModel {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            (proptest::option::of(any::<String>()), proptest::option::of(any::<Ob>()))
                .prop_map(|(id, ob)| SpecializeModel { id, ob })
                .boxed()
        }
    }

    impl Arbitrary for InstantiatedModel {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            (
                any::<String>(),
                arb_uuid(),
                proptest::option::of(any::<Link>()),
                prop::collection::vec(any::<SpecializeModel>(), 0..3),
            )
                .prop_map(|(name, id, model, specializations)| InstantiatedModel {
                    name,
                    id,
                    model,
                    specializations,
                })
                .boxed()
        }
    }

    impl Arbitrary for EqnDecl {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            (
                any::<String>(),
                arb_uuid(),
                proptest::option::of(any::<Mor>()),
                proptest::option::of(any::<Mor>()),
            )
                .prop_map(|(name, id, lhs, rhs)| EqnDecl { name, id, lhs, rhs })
                .boxed()
        }
    }

    impl Arbitrary for ModelJudgment {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_: Self::Parameters) -> Self::Strategy {
            prop_oneof![
                any::<ObDecl>().prop_map(ModelJudgment::Object),
                any::<MorDecl>().prop_map(ModelJudgment::Morphism),
                any::<EqnDecl>().prop_map(ModelJudgment::Equation),
                any::<InstantiatedModel>().prop_map(ModelJudgment::Instantiation),
            ]
            .boxed()
        }
    }
}
