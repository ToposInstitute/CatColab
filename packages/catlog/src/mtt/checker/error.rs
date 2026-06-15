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

    #[display("The variable {_0} is not bound by the domain of the judgement")]
    /// A variable referenced in the body does not appear in the domain object
    /// term, i.e. it is free in the body. The Hom rule may only lift object
    /// terms built from variables that the binder introduces into scope.
    UnboundVariable(String),

    #[display("The domain binder {term} is malformed against its type {object_type}")]
    /// The domain object term and its object type disagree in shape (e.g. a
    /// list term against a non-list type), so no consistent variable scope can
    /// be extracted from the binder.
    MalformedBinder {
        /// The domain object term.
        term: String,
        /// The domain object type it was checked against.
        object_type: String,
    },

    #[display("A hole is not permitted in the domain binder")]
    /// The domain binder contained a hole. The binder is the claimed left-hand
    /// side of the judgement, so it must be a fully-specified object term
    /// introducing a definite variable scope; a hole has no place there.
    HoleInBinder,

    #[display("Tuple binders are not currently implemented")]
    /// The domain binder contained a tuple. Tuples are a theory-registered
    /// shorthand for a particular function application; elaborating them in
    /// binders is not yet implemented.
    TupleBinderUnimplemented,

    #[display("The synthesised domain {found} cannot be reconciled with the declared {expected}")]
    /// The domain end of the synthesised term cannot be reconciled with the
    /// declared binder, and no coercion (list manipulation / restriction)
    /// supplied by the theory bridges the gap.
    DomainMismatch {
        /// The declared domain (from the binder).
        expected: String,
        /// The synthesised domain end of the body.
        found: String,
    },

    #[display(
        "The synthesised codomain object type {found} does not match the declared {expected}"
    )]
    /// The object type synthesised for the body does not match the declared
    /// codomain object type of the judgement.
    CodomainObjectTypeMismatch {
        /// The declared codomain object type.
        expected: String,
        /// The synthesised codomain object type.
        found: String,
    },

    #[display(
        "The synthesised codomain theory object {found} does not match the declared {expected}"
    )]
    /// The theory object synthesised for the body does not match the declared
    /// codomain theory object of the judgement.
    CodomainTheoryObjectMismatch {
        /// The declared codomain theory object.
        expected: String,
        /// The synthesised codomain theory object.
        found: String,
    },

    #[display("The synthesised pro-arrow {found} does not match the declared {expected}")]
    /// The composite theory pro-arrow synthesised for the body does not match
    /// the declared (or inferred) `over` of the judgement, up to flat
    /// hom-collapse.
    ProArrowMismatch {
        /// The declared composite theory pro-arrow.
        expected: String,
        /// The synthesised composite theory pro-arrow.
        found: String,
    },

    #[display("Cannot post-compose the generator {generator} onto a pro-term with codomain {onto}")]
    /// A post-composition's generating pro-arrow does not compose with the
    /// codomain of the pro-term it is being applied to.
    NonComposablePostComposition {
        /// The generating pro-arrow being post-composed.
        generator: String,
        /// The codomain of the pro-term it was applied to.
        onto: String,
    },

    #[display("{_0} is not a generating pro-arrow in this model")]
    /// The head of an application is neither a model generating pro-arrow nor a
    /// theory vertical arrow, so it cannot be applied.
    NotApplicable(String),

    #[display("Cannot apply the operation {operation} to a pro-term with codomain {onto}")]
    /// An operation (theory vertical arrow) was applied to a pro-term whose
    /// codomain theory object does not meet the operation's domain.
    OperationNotApplicable {
        /// The operation (theory vertical arrow) being applied.
        operation: String,
        /// The codomain theory object of the pro-term it was applied to.
        onto: String,
    },

    #[display(
        "The operation {operation} does not determine its transported pro-arrow; annotate the result"
    )]
    /// An operation (theory vertical arrow) was applied without a hint, and the
    /// transported pro-arrow could not be inferred from the boundary. Because a
    /// general vertical arrow has no canonical pushforward of a pro-arrow, the
    /// result must be annotated to name the transported pro-arrow.
    OperationNeedsAnnotation {
        /// The operation (theory vertical arrow) being applied.
        operation: String,
    },

    #[display("The theory {theory} has no cell witnessing the application of {operation}")]
    /// An operation application would require a cell transporting the
    /// pro-term's pro-arrow along the operation, but the theory has none.
    NoApplicableCell {
        /// The theory consulted.
        theory: String,
        /// The operation (theory vertical arrow) being applied.
        operation: String,
    },

    #[display("A list pro-term was supplied, but the theory {_0} has no list modality")]
    /// A list term was encountered but the theory does not support lists.
    NoListModality(String),

    #[display(
        "A list's elements do not lie over a common pro-arrow (found {found}); a list lies over a single common pro-arrow"
    )]
    /// A list pro-term's elements were found not to unify to a single common
    /// pro-arrow. The list-formation rule requires every element to lie over
    /// one common atomic pro-arrow.
    HeterogeneousListProArrows {
        /// The distinct pro-arrows found among the elements.
        found: String,
    },

    #[display("Unsupported body expression: {_0}")]
    /// A body expression form that is not (yet) supported in this theory.
    UnsupportedBody(String),
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

    #[display("Could not form the composite of theory pro-arrows: {_0}")]
    /// We were not able to form the composite of theory pro-arrows specified.
    InvalidTheoryProArrowComposite(String),

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
