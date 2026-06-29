//! Contexts store the type and values of in-scope variables during elaboration.

use derive_more::Constructor;

use crate::tt::{prelude::*, val::*};

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
    pub ty: Option<BaseTyV>,
}

/// Each *fiber* variable in context — a generator or sub-instance import
/// introduced inside an instance body — with its label and fiber type.
#[derive(Constructor)]
pub struct FiberVarInContext {
    /// The name of the fiber variable.
    pub name: VarName,
    /// The label for the fiber variable.
    pub label: LabelSegment,
    /// The fiber type of the variable.
    pub ty: FiberTyV,
}

/// The variable context during elaboration.
///
/// Carries two scopes: the **base** context (`env`/`scope`) of ordinary
/// terms typed by [`BaseTyV`], and a separate **fiber** context
/// (`fiber_env`/`fiber_scope`) of instance generators and sub-instance
/// imports typed by [`FiberTyV`]. The fiber scope is populated only while
/// elaborating an instance body; the two never alias, so neither lookup
/// can see the other's variables. See [`crate::tt::toplevel`] for why the
/// two worlds are distinct.
pub struct Context {
    /// Stores the value of each of the base variables in context.
    pub env: Env,
    /// Stores the names and types of each of the base variables in context.
    pub scope: Vec<VarInContext>,
    /// Stores the value of each fiber variable in context.
    pub fiber_env: FiberEnv,
    /// Stores the names and fiber types of each fiber variable in context.
    pub fiber_scope: Vec<FiberVarInContext>,
}

/// A checkpoint that we can return the context to.
pub struct ContextCheckpoint {
    env: Env,
    scope: usize,
    fiber_env: FiberEnv,
    fiber_scope: usize,
}

impl Default for Context {
    fn default() -> Self {
        Self::new()
    }
}

impl Context {
    /// Create an empty context.
    pub fn new() -> Self {
        Self {
            env: Env::Nil,
            scope: Vec::new(),
            fiber_env: FiberEnv::Nil,
            fiber_scope: Vec::new(),
        }
    }

    /// Create a checkpoint from the current state of the context.
    pub fn checkpoint(&self) -> ContextCheckpoint {
        ContextCheckpoint {
            env: self.env.clone(),
            scope: self.scope.len(),
            fiber_env: self.fiber_env.clone(),
            fiber_scope: self.fiber_scope.len(),
        }
    }

    /// Reset the context to a previously-saved checkpoint.
    pub fn reset_to(&mut self, c: ContextCheckpoint) {
        self.env = c.env;
        self.scope.truncate(c.scope);
        self.fiber_env = c.fiber_env;
        self.fiber_scope.truncate(c.fiber_scope);
    }

    /// Add a new base variable to scope (note: does not add it to the environment).
    pub fn push_scope(&mut self, name: VarName, label: LabelSegment, ty: Option<BaseTyV>) {
        self.scope.push(VarInContext::new(name, label, ty))
    }

    /// Lookup a base variable by name.
    pub fn lookup(&self, name: VarName) -> Option<(BwdIdx, LabelSegment, Option<BaseTyV>)> {
        self.scope
            .iter()
            .rev()
            .enumerate()
            .find(|(_, v)| v.name == name)
            .map(|(i, v)| (i.into(), v.label, v.ty.clone()))
    }

    /// Add a new fiber variable to scope (note: does not add it to the
    /// fiber environment).
    pub fn push_fiber(&mut self, name: VarName, label: LabelSegment, ty: FiberTyV) {
        self.fiber_scope.push(FiberVarInContext::new(name, label, ty))
    }

    /// Lookup a fiber variable by name.
    pub fn lookup_fiber(&self, name: VarName) -> Option<(BwdIdx, LabelSegment, FiberTyV)> {
        self.fiber_scope
            .iter()
            .rev()
            .enumerate()
            .find(|(_, v)| v.name == name)
            .map(|(i, v)| (i.into(), v.label, v.ty.clone()))
    }
}
