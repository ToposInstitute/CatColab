/*! Morphisms between models of double theories.

A morphism between [models](super::model) consists of functions between objects
and between morphisms that are:

1. *Well-typed*: preserve object and morphism types
2. *Functorial*: preserve composition and identities
3. *Natural*: commute with object operations and morphism operations, possibly up
   to comparison maps

In mathematical terms, a model morphism is a natural transformation between lax
double functors. The natural transformation can be strict, pseudo, lax, or
oplax. For models of *discrete* double theories, all these options coincide.

# References

- [Paré 2011](crate::refs::DblYonedaTheory), Section 1.5: Natural
  transformations
- [Lambert & Patterson 2024](crate::refs::CartDblTheories),
  Section 7: Lax transformations
 */

use thiserror::Error;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

pub use super::discrete::model_morphism::*;

/// An invalid assignment in a morphism between models of a double theory.
#[derive(Clone, Debug, Error, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum InvalidDblModelMorphism<ObGen, MorGen> {
    /// An object generator not mapped to an object in the codomain model.
    #[error("Object generator `{0}` is not mapped to an object in the codomain")]
    Ob(ObGen),

    /// A morphism generator not mapped to a morphism in the codomain model.
    #[error("Morphism generator `{0}` is not mapped to a morphism in the codomain")]
    Mor(MorGen),

    /// A morphism generator whose domain is not preserved.
    #[error("Domain of morphism generator `{0}` is not preserved")]
    Dom(MorGen),

    /// A morphism generator whose codomain is not preserved.
    #[error("Codomain of morphism generator `{0}` is not preserved")]
    Cod(MorGen),

    /// An object generator whose type is not preserved.
    #[error("Object `{0}` is not mapped to an object of the same type in the codomain")]
    ObType(ObGen),

    /// A morphism generator whose type is not preserved.
    #[error("Morphism `{0}` is not mapped to a morphism of the same type in the codomain")]
    MorType(MorGen),

    /// A path equation in domain presentation that is not respected.
    #[error("Path equation `{0}` is not respected")]
    Eq(usize),
}
