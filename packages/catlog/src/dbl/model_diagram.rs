//! Diagrams in models of a double theory.
//!
//! A **diagram** in a [model](super::model) is simply a
//! [morphism](super::model_morphism) into that model. This includes the domain of
//! that morphism, which is assumed to be a free model.
//!
//! Diagrams are currently used primarily to represent instances of models from a
//! fibered perspective, generalizing how a diagram in a category can be used to
//! represent a copresheaf over that category.

use derive_more::{From, Into};
use nonempty::NonEmpty;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::dbl::discrete::DiscreteDblModelMapping;
use crate::dbl::modal::ModalDblModelMapping;
use crate::dbl::model::{DiscreteDblModel, FpDblModel, ModalDblModel, MutDblModel};
use crate::dbl::theory::Unital;
use crate::one::FgCategory;

pub use super::discrete::model_diagram::*;
pub use super::modal::diagram::*;

/// A diagram in a model of a double theory.
///
/// This struct owns its data, namely, the domain of the diagram (a model) and the
/// model mapping itself.
pub trait Diagram {
    type Model: FgCategory + FpDblModel + MutDblModel;
    type Mapping;
    type InvalidDiagram;

    fn destructure(&self) -> (Self::Mapping, Self::Model);

    fn validate_in(&self, model: &Self::Model) -> Result<(), NonEmpty<Self::InvalidDiagram>>;

    fn iter_invalid_in<'a>(
        &'a self,
        model: &'a Self::Model,
    ) -> impl Iterator<Item = Self::InvalidDiagram> + 'a;

    fn infer_missing_from(&mut self, model: &Self::Model);
}

pub enum DblModelDiagramType {
    Discrete(DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>),
    ModalUnital(DblModelDiagram<ModalDblModelMapping, ModalDblModel<Unital>>),
}

/// A diagram in a model of a double theory.
///
/// This struct owns its data, namely, the domain of the diagram (a model) and the
/// model mapping itself.
#[derive(Clone, Into, From)]
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
