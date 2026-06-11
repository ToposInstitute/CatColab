//! TODO
use derive_more::{Display, From};

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
    #[display("The expression {_0} is not a syntactically valid theory object")]
    /// The expression does not specify a syntactically valid theory object.
    InvalidTheoryObject(String),

    #[display("The expression {_0} does not determine a theory arrow")]
    /// The expression does not determine a theory arrow.
    InvalidTheoryArrow(String),

    #[display("Unknown theory arrow {_0}")]
    /// Unknown theory arrow.
    UnknownTheoryArrow(String),

    #[display("Unknown theory pro-arrow {_0}")]
    /// Unknown theory pro-arrow.
    UnknownTheoryProArrow(String),

    #[display("Could not form the composite of theory arrows: {_0}")]
    /// We were not able to form the composite of theory arrows specified.
    InvalidTheoryArrowComposite(String),

    #[display("The expression {_0} is not a syntactically valid model object type")]
    /// The expression does not specify a syntactically valid model object type
    InvalidModelObjectType(String),

    #[display("The modality {_0} does not exist in the theory")]
    /// The specified modality does not exist in the theory.
    UnknownModality(String),

    #[display("Unsupported syntax: {_0}")]
    /// Currently unsupported syntactical feature.
    UnsupportedSyntax(String),
}

#[derive(Display)]
/// An enum of errors that type inference may produce.
pub enum EInfer {
    #[display("No theory pro-arrow lies over the boundary of {_0}")]
    /// We were asked to infer the theory pro-arrow over which this model
    /// pro-arrow lives, but there isn't one.
    NoTheoryProArrow(String),

    #[display("The theory has no list modality, but one was required to infer a theory object")]
    /// We were asked to infer a theory object involving a list modality, but
    /// the theory has no list modality.
    NoTheoryListModality,

    #[display("There is no consistent theory object for the elements of a list")]
    /// We were asked to infer a theory object from a list of object types, but
    /// there is no consistent choice.
    InconsistentTheoryObjectForList,

    #[display("More than one theory pro-arrow lies over the boundary of {_0}")]
    /// We were asked to infer the theory pro-arrow over which this model
    /// pro-arrow lives, but there is not a unique answer.
    AmbiguousTheoryProArrow(String),
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
    #[display("Cannot refine known theory object {known} with {with}")]
    /// A new observation about a theory object hole conflicts with what was
    /// already known.
    CannotUnify { known: String, with: String },
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

    #[from(skip)]
    #[display("Unknown theory: {_0}")]
    /// The model named a theory for which there is no implementation.
    UnknownTheory(String),

    #[from(skip)]
    #[display("Unimplemented feature: {_0}")]
    /// A particular feature is unimplented.
    Unimplemented(String),
}

/// The type of the outermost checking procedure.
pub type CheckResult = Result<(), Error>;
