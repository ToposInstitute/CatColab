//! Diagrams in models of a modal double theory

// TODO use super
use crate::dbl::modal::ModalDblModel;
use crate::dbl::modal::ModalDblModelMapping;
use crate::dbl::model_diagram::*;

/// A diagram i a model of a modal double theoruy.
pub type ModalDblModelDiagram = DblModelDiagram<ModalDblModelMapping, ModalDblModel>;

impl ModalDblModelDiagram {}
