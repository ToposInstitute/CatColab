/*! Diagrams in models of a double theory.

A **diagram** in a [model](super::model) is simply a
[morphism](super::model_morphism) into that model. This includes the domain of
that morphism, which is assumed to be a free model.

Diagrams are currently used primarily to represent instances of models from a
fibered perspective, generalizing how a diagram in a category can be used to
represent a copresheaf over that category.
 */

use derive_more::Into;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

pub use super::discrete::model_diagram::*;

/** A diagram in a model of a double theory.

This struct owns its data, namely, the domain of the diagram (a model) and the
model mapping itself.
*/
#[derive(Clone, Into)]
#[into(owned, ref, ref_mut)]
pub struct DblModelDiagram<Map, Dom>(pub Map, pub Dom);

/// A failure of a diagram in a model to be valid.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "err"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum InvalidDblModelDiagram<DomErr, MapErr> {
    /// Domain of the diagram is invalid.
    Dom(DomErr),

    /// Mapping underlying the diagram is invalid.
    Map(MapErr),
}
