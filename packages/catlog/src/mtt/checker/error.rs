use derive_more::{Display, From};

use crate::mtt::display_helpers::DHList;

#[derive(Display)]
/// An enum of the errors that checking may produce.
pub enum EType {
    #[display("The object {object} is not valid in {theory}")]
    /// The object in question does not belong to a particular theory.
    InvalidTheoryObject {
        /// Which theory lead to this objection.
        theory: String,
        /// The object in question which does not belong to the theory.
        object: String,
    },

    #[display("The pro-arrow {pro_arrow} is not valid in {theory}")]
    /// The pro-arrow in question does not belong to a particular theory.
    InvalidTheoryProArrow {
        /// Which theory lead to this objection.
        theory: String,
        /// The pro-arrow in question which does not belong to the theory.
        pro_arrow: String,
    },

    #[display("The object type {object_type} does not match the theory object {theory_object}")]
    /// The object type in question does not live over the theory object, we
    /// don't privilege either one of these in this error.
    BadObjectTypeTheoryObject {
        /// The object type we're inspecting.
        object_type: String,
        /// The theory object we're inspecting.
        theory_object: String,
    },
}

#[derive(Display)]
/// An enum of errors that elaboration may produce.
pub enum EElaborate {
    /// The expression does not specify a syntactically valid theory object.
    InvalidTheoryObject(String),

    /// The expression does not determine a theory arrow.
    InvalidTheoryArrow(String),

    /// Unknown theory arrow.
    UnknownTheoryArrow(String),

    /// Unknown theory arrow.
    UnknownTheoryProArrow(String),

    /// We were not able to form the composite of theory arrows specified.
    InvalidTheoryArrowComposite(String),

    /// The expression does not specify a syntactically valid model object type
    InvalidModelObjectType(String),

    /// The specified modality does not exist in the theory.
    UnknownModality(String),

    /// Currently unsupported syntactical feature.
    UnsupportedSyntax(String),
}

#[derive(Display)]
/// An enum of errors that type inference may produce.
pub enum EInfer {
    /// We were asked to infer the generating theory pro-arrow over which this
    /// generating model pro-arrow lives, but there isn't one.
    NoTheoryGeneratingProArrow(String),

    /// We were asked to infer a theory object involving a list modality, but
    /// the theory has no list modality.
    NoTheoryListModality,

    /// We were asked to infer a theory object from a list of object types, but
    /// there is no consistent choice.
    InconsistentTheoryObjectForList,

    /// We were asked to infer the generating theory pro-arrow over which this
    /// generating model pro-arrow lives, but there is not a unique answer.
    AmbiguousTheoryGeneratingProArrow(String),
}

#[derive(Display)]
/// An enum of errors that context interactions may produce.
pub enum EContext {
    #[display("Redecleration of {_0}")]
    /// Redeclaring a named symbol in a context.
    Redecleration(String),

    #[display("Unbound name {_0}")]
    /// Unbound name of a symbol in a context.
    Unbound(String),
}

#[derive(Display)]
/// An enum of errors that constraint interactions may produce.
pub enum EConstraint {
    #[display(
        "Cannot unify additional constraint {with} with known constraints {}",
        DHList(known)
    )]
    CannotUnify { known: Vec<String>, with: String },
}

#[derive(Display, From)]
/// The union of all errors that may occur when checking an AST.
pub enum Error {
    /// A type error.
    TypeError(EType),
    /// An elaboration error.
    ElaborationError(EElaborate),
    /// An inference error.
    InferenceError(EInfer),
    /// A context error.
    ContextError(EContext),
    /// A constraint error.
    ConstraintError(EConstraint),

    #[display("Unimplemented feature: {_0}")]
    /// A particular feature is unimplented.
    Unimplemented(String),
}

/// The type of the outermost checking procedure.
pub type CheckResult = Result<(), Error>;
