use derive_more::Display;
use textwrap::indent;

use crate::mtt::arrow::{Arrow, ProArrowKind};
use crate::mtt::display_helpers::{DHBindings, DHList, DHTuple};

#[derive(Display)]
#[display("{}", models.iter().map(|m| m.to_string()).collect::<Vec<_>>().join("\n"))]
/// A model type theory programme.
pub struct Program {
    /// Ordered list of models, the ordering is used for dependency resolution.
    pub models: Vec<Model>,
}

#[derive(Clone, Display)]
#[display("model {name} of {theory} {{\n{}\n}}", indent(&decls.iter().map(|d| d.to_string()).collect::<Vec<_>>().join("\n"), "  "))]
/// A model specifies a theory which it instantiates, and provides a finite
/// presentation via generators and relations.
pub struct Model {
    /// Name of the model.
    pub name: String,
    /// Ordered declarations.
    pub decls: Vec<Decl>,
    /// A reference to the static, zero-sized theory implemented in theories/
    /// and instantiated in theories/mod.rs.
    pub theory: String,
}

#[derive(Clone, Display)]
/// A model is finitely presented by generators and relations.
pub enum Decl {
    #[display("const {name}: {over}")]
    /// An object genetaror.
    ObjectGenerator {
        /// The name of the generator.
        name: String,
        /// The object in the theory over which this object lies.
        over: Expression,
    },

    #[display("const {} {over}", Arrow::<_,ProArrowKind>::from(name.clone(), dom, cod))]
    /// A pro-arrow generator.
    ProArrowGenerator {
        /// The name of the generator.
        name: String,
        /// The domain ObjectType of the generator.
        dom: Expression,
        /// The codomain ObjectType of the generator.
        cod: Expression,
        /// The pro-arrow P in the theory for which the generator lies over
        /// P(dom, cod). If this is omitted the checker will attempt to infer
        /// it.
        over: ExpressionProArrow,
    },

    #[display("fn {name}({binder}) -> {codomain} {over} {{\n{}\n}}", indent(&body.to_string(), "  "))]
    /// A derived pro-term, something of the form Γ | x : X ⊢_P y : Y, where P
    /// is a theory-proarrow.
    Definition {
        /// The name of the definition, effectively the name "y" in the above.
        name: String,
        /// The domain binding, "x : X" in the above.
        binder: Binder,
        /// The codomain object, "Y" in the above.
        codomain: Expression,
        /// The theory pro-arrow over which this pro-term judgement lives. If
        /// this is omitted the checker will attempt to infer it.
        over: ExpressionProArrow,
        /// The content of the definition, effectively the content of "y" in the
        /// above.
        body: Expression,
    },

    #[display("const {name} : Eq({binder} -> {codomain} {over}, {lhs} == {rhs})")]
    /// A generating relation, something of the form Γ | r : Eq(x : X, Y, t, s),
    /// which equates two pro-terms in the presentation.
    Relation {
        /// The name of the definition, effectively the name "r" in the above.
        name: String,
        /// The domain binding, the "x : X" in the above.
        binder: Binder,
        /// The codomain object, the "Y" in the above.
        codomain: Expression,
        /// The common theory pro-arrow over which both pro-term judgments are
        /// made. If this is omitted the checker will attempt to infer it.
        over: ExpressionProArrow,
        /// One of the pro-terms which is the subject of the relation.
        lhs: Expression,
        /// The other of the pro-terms which is the subject of the relation.
        rhs: Expression,
    },

    #[display("use {source} as {local}{}", DHBindings(bindings))]
    /// A use statement, which brings a copy of another model into this model,
    /// possibly with the identification of generating objects.
    Use {
        /// Which model are we importing?
        source: String,
        /// What are we going to call its record?
        local: String,
        /// Which objects are we identifying?
        bindings: Vec<ObjectGeneratorIdentification>,
    },
}

#[derive(Clone, Display)]
/// Purely syntactical expressions for the AST, and as such many of these do not
/// have precise meanings to give. The job of the checker is to elaborate this
/// syntax into rigorous [ObjectType], [ObjectTerm], and [ProTerm] instances.
/// This type is very persmissive, far more so than the parser will allow.
pub enum Expression {
    /// A literal string, the atomic case.
    Literal(String),

    #[display("({post}) ({pre})")]
    /// The juxtaposition of expressions.
    Juxtaposition {
        /// The expression in the "post" position.
        post: Box<Expression>,
        /// The expression in the "pre" position.
        pre: Box<Expression>,
    },

    #[display("{}", DHList(_0))]
    /// A list of expressions.
    List(Vec<Expression>),

    #[display("{}", DHTuple(_0))]
    /// A tuple of expressions, an affordance of convenience for working in
    /// theories with a specified unbiased algebra on lists.
    Tuple(Vec<Expression>),

    #[display("{subject}: {domain} -> {codomain} {over}")]
    /// A pro-arrow annotation, used as a hint during checking.
    ProArrowAnnotation {
        /// The expression being annotated.
        subject: Box<Expression>,
        /// The domain being hinted.
        domain: Box<Expression>,
        /// The codomain being hinted.
        codomain: Box<Expression>,
        /// The optional theory pro-arrow being hinted.
        over: Box<ExpressionProArrow>,
    },
}

#[derive(Clone, Display)]
/// Purely syntactical expressions for the AST, representing the extent to which
/// the user has named a pro-arrow.
pub enum ExpressionProArrow {
    #[display("")]
    /// No pro-arrow provided by the user.
    None,

    #[display("{_0}")]
    /// The user has named a pro-arrow by name alone.
    NameOnly(String),

    #[display("{_0}")]
    /// The user has provided complete data for the pro-arrow.
    Complete(Arrow<Expression, ProArrowKind>),
}

impl Expression {
    /// This function performs a kind of tree rotation, taking the juxtaposition
    /// (F G) H to the right-associated F (G H). Intentionally we do not recurse
    /// through other syntactic forms, as the intended use-case simultaneously
    /// walks the tree and performs checks, calling this as necessary.
    pub fn right_associate_juxtaposition(&self) -> Expression {
        if let Expression::Juxtaposition { post, pre } = self {
            let post = Box::new(post.right_associate_juxtaposition());
            let pre = Box::new(pre.right_associate_juxtaposition());
            if let Expression::Juxtaposition { post: post_post, pre: post_pre } = *post {
                Expression::Juxtaposition {
                    post: post_post,
                    pre: Box::new(Expression::Juxtaposition { post: post_pre, pre }),
                }
            } else {
                Expression::Juxtaposition { post, pre }
            }
        } else {
            self.clone()
        }
    }
}

#[derive(Clone, Display)]
#[display("{object_term} : {object_type}")]
/// A container for binders, used in definitions and relations.
pub struct Binder {
    /// The term being bound.
    pub object_term: Expression,
    /// The object type.
    pub object_type: Expression,
}

#[derive(Clone, Display)]
#[display("{foreign_generator} = {source_generator}")]
/// A specification of identification used when including other models into a
/// new one.
pub struct ObjectGeneratorIdentification {
    /// Name of an object generator from the includee.
    pub foreign_generator: String,
    /// Name of an object generator of the includor.
    pub source_generator: String,
}
