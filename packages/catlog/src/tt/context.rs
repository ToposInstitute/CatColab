//! Contexts store the type and values of in-scope variables during elaboration.

use derive_more::Constructor;

use crate::tt::{prelude::*, val::*};

/// What kind of binding a context entry represents.
///
/// Most bindings are ordinary `Term` bindings. `Diagram` bindings are pushed
/// by the `diagram` toplevel arm so that `@over .E` can recover the
/// enclosing diagram's name and codomain type without exposing the diagram
/// to ordinary term lookup (where it would masquerade as a term of the
/// codomain type).
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum VarKind {
    /// An ordinary term-level binding.
    Term,
    /// A binding for a diagram declaration; not resolvable by [`Context::lookup`].
    Diagram,
}

/// Each variable in context is associated with a label and a type.
///
/// Multiple variables with the same name can show up in context; in this case
/// the most recent one is selected, following the standard scope conventions.
#[derive(Constructor)]
pub struct VarInContext {
    /// The name of the variable.
    pub name: VarName,
    /// The label for the variable.
    pub label: LabelSegment,
    /// The type of the variable.
    ///
    /// We allow the type to be null as a hack for the `self` variable before we
    /// know the type of the `self` variable.
    pub ty: Option<TyV>,
    /// What kind of binding this is.
    pub kind: VarKind,
}

/// The variable context during elaboration.
pub struct Context {
    /// Stores the value of each of the variables in context.
    pub env: Env,
    /// Stores the names and types of each of the variables in context.
    pub scope: Vec<VarInContext>,
}

/// A checkpoint that we can return the context to.
pub struct ContextCheckpoint {
    env: Env,
    scope: usize,
}

impl Default for Context {
    fn default() -> Self {
        Self::new()
    }
}

impl Context {
    /// Create an empty context.
    pub fn new() -> Self {
        Self { env: Env::Nil, scope: Vec::new() }
    }

    /// Create a checkpoint from the current state of the context.
    pub fn checkpoint(&self) -> ContextCheckpoint {
        ContextCheckpoint {
            env: self.env.clone(),
            scope: self.scope.len(),
        }
    }

    /// Reset the context to a previously-saved checkpoint.
    pub fn reset_to(&mut self, c: ContextCheckpoint) {
        self.env = c.env;
        self.scope.truncate(c.scope);
    }

    /// Add a new term-kind variable to scope (note: does not add it to the environment).
    pub fn push_scope(&mut self, name: VarName, label: LabelSegment, ty: Option<TyV>) {
        self.scope.push(VarInContext::new(name, label, ty, VarKind::Term))
    }

    /// Add a new diagram-kind variable to scope.
    pub fn push_diagram(&mut self, name: VarName, label: LabelSegment, ty: TyV) {
        self.scope.push(VarInContext::new(name, label, Some(ty), VarKind::Diagram))
    }

    /// Lookup a term-kind variable by name.
    ///
    /// Diagram-kind entries are skipped, so a `Var(I)` referring to an
    /// enclosing `diagram I := ...` will not resolve here.
    pub fn lookup(&self, name: VarName) -> Option<(BwdIdx, LabelSegment, Option<TyV>)> {
        self.scope
            .iter()
            .rev()
            .enumerate()
            .find(|(_, v)| v.kind == VarKind::Term && v.name == name)
            .map(|(i, v)| (i.into(), v.label, v.ty.clone()))
    }

    /// Find the most recent diagram-kind binding in scope, if any.
    ///
    /// Returns the diagram's name and codomain type. Used by the `@over .E`
    /// type elaborator.
    pub fn lookup_diagram(&self) -> Option<(VarName, TyV)> {
        self.scope
            .iter()
            .rev()
            .find(|v| v.kind == VarKind::Diagram)
            .map(|v| (v.name, v.ty.clone().expect("diagram binding must have a type")))
    }
}
