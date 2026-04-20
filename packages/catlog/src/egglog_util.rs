//! Utilities for working with e-graphs as implemented in egglog.

use egglog::ast::{Actions, Command, Expr};
use egglog::{Error, prelude::*};

/// Extension trait for [`EGraph`] with convenience methods.
pub trait EGraphUtils {
    /// Runs a single action on the e-graph.
    fn run_action(&mut self, action: Action) -> Result<(), Error>;

    /// Runs multiple actions on the e-graph.
    fn run_actions(&mut self, actions: Actions) -> Result<(), Error>;

    /// Checks equality of two expressions in e-graph.
    fn check_equal(&mut self, lhs: Expr, rhs: Expr) -> Result<bool, Error>;
}

impl EGraphUtils for EGraph {
    fn run_action(&mut self, action: Action) -> Result<(), Error> {
        self.run_program(vec![Command::Action(action)])?;
        Ok(())
    }

    fn run_actions(&mut self, actions: Actions) -> Result<(), Error> {
        let commands = actions.0.into_iter().map(Command::Action).collect();
        self.run_program(commands)?;
        Ok(())
    }

    fn check_equal(&mut self, lhs: Expr, rhs: Expr) -> Result<bool, Error> {
        let result = self.run_program(vec![Command::Check(
            span!(),
            vec![fact!((= (unquote lhs) (unquote rhs)))],
        )]);
        match result {
            Ok(_) => Ok(true),
            Err(Error::CheckError(_, _)) => Ok(false),
            Err(error) => Err(error),
        }
    }
}
