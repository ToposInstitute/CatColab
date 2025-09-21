//! Contexts store the type and values of in-scope variables during elaboration
use crate::tt::{prelude::*, val::*};

/// The variable context during elaboration
pub struct Context {
    /// Stores the value of each of the variables in context
    pub env: Env,
    /// Stores the names and types of each of the variables in context.
    ///
    /// We allow the type to be "none" as a hack for the `self` variable before we
    /// know the type of the `self` variable.
    pub scope: Vec<(VarName, Option<TyV>)>,
}

/// A checkpoint that we can return the context to.
pub struct ContextCheckpoint {
    env: Env,
    scope: usize,
}

impl Context {
    /// Create an empty context
    pub fn new() -> Self {
        Self {
            env: Env::Nil,
            scope: Vec::new(),
        }
    }

    /// Create a checkpoint from the current state of the context
    pub fn checkpoint(&self) -> ContextCheckpoint {
        ContextCheckpoint {
            env: self.env.clone(),
            scope: self.scope.len(),
        }
    }

    /// Reset the context to a previously-saved checkpoint
    pub fn reset_to(&mut self, c: ContextCheckpoint) {
        self.env = c.env;
        self.scope.truncate(c.scope);
    }
}
