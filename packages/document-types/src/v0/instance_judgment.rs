use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::api::Link;
use super::model::{Mor, Ob};
use super::theory::{Modality, ObOp};

/// Declares a generator of an instance of a model.
///
/// The generator lies in the fiber over an object of the codomain model.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct InstanceGenDecl {
    /// Human-readable label for generator.
    pub name: String,

    /// Globally unique identifier of generator.
    pub id: Uuid,

    /// Object of the codomain model that the generator lies over, if defined.
    pub over: Option<Ob>,
}

/// Imports another instance of the codomain model into this instance.
///
/// The generators of the imported instance become available in equations
/// under qualified names, projecting out of the import.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct InstanceImport {
    /// Human-readable label for the import.
    pub name: String,

    /// Globally unique identifier of the import.
    pub id: Uuid,

    /// Link to the instance document to import, if defined.
    pub instance: Option<Link>,
}

/// Declares an equation between two terms in an instance.
///
/// The two sides are [instance terms](InstanceTm), built from generators by
/// the actions of the codomain model's morphisms.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct InstanceEqnDecl {
    /// Human-readable label for equation.
    pub name: String,

    /// Globally unique identifier of equation.
    pub id: Uuid,

    /// The left-hand side of the equation, if defined.
    pub lhs: Option<InstanceTm>,

    /// The right-hand side of the equation, if defined.
    pub rhs: Option<InstanceTm>,
}

/// A term in the language of an instance of a model.
///
/// Terms are given at the syntax level: applications may nest freely, as in
/// `add(sub([x, y]), z)`. Elaboration normalizes a term to a single morphism
/// action applied once to a base of generators.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub enum InstanceTm {
    /// Reference to a generator by qualified name.
    ///
    /// Generators of imported instances are referenced by paths through the
    /// import, e.g. `"<import id>.<generator id>"`.
    Generator(String),

    /// The action of a morphism of the codomain model on an argument term.
    App {
        /// The acting morphism.
        mor: Mor,

        /// The argument, lying over the morphism's domain.
        arg: Box<InstanceTm>,
    },

    /// List of terms, each possibly ill-defined, in a list modality.
    ///
    /// Lies over a list object of the codomain model.
    List {
        /// The list modality.
        modality: Modality,

        /// The terms in the list.
        terms: Vec<Option<InstanceTm>>,
    },

    /// Application of an object operation to a term.
    ///
    /// Lies over the operation applied to the fiber of the argument, e.g. a
    /// term over a tensor product of objects.
    ObApp {
        /// The object operation.
        op: ObOp,

        /// The argument term.
        tm: Box<InstanceTm>,
    },
}

/// A judgment defining part of an instance of a model of a double theory.
///
/// Instance notebooks target presentations of instances
/// via fibered generators plus equations between morphism actions on them, in
/// contrast to [diagram judgments](super::diagram_judgment::DiagramJudgment),
/// which present instances less efficiently via a model morphism.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum InstanceJudgment {
    /// Declares a generator of the instance.
    #[serde(rename = "generator")]
    Generator(InstanceGenDecl),

    /// Imports another instance of the codomain model.
    #[serde(rename = "import")]
    Import(InstanceImport),

    /// Declares an equation between two instance terms.
    #[serde(rename = "equation")]
    Equation(InstanceEqnDecl),
}
