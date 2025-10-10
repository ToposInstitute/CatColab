//! Utilities for working with e-graphs as implemented in egglog.

use std::fmt::Display;

use egglog::{EGraph, Error, ast::*, span};
use ref_cast::RefCast;

/// An egglog program.
///
/// This struct is just a newtype wrapper around a vector of [`Command`]s with a
/// builder interface.
#[derive(Clone, Debug, RefCast)]
#[repr(transparent)]
pub struct Program(pub Vec<Command>);

/// Displays the program as a newline-separated sequence of S-expressions.
impl Display for Program {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for command in self.0.iter() {
            writeln!(f, "{command}")?;
        }
        Ok(())
    }
}

impl Program {
    /// Checks equality of two expressions, possibly after running a schedule.
    pub fn check_equal(&mut self, lhs: Expr, rhs: Expr, schedule: Option<Schedule>) {
        let prog = &mut self.0;
        if let Some(schedule) = schedule {
            // Should we assign to gensym-ed bindings rather than cloning?
            prog.push(Command::Action(Action::Expr(span!(), lhs.clone())));
            prog.push(Command::Action(Action::Expr(span!(), rhs.clone())));
            prog.push(Command::RunSchedule(schedule));
        }
        prog.push(Command::Check(span!(), vec![Fact::Eq(span!(), lhs, rhs)]));
    }

    /// Unions the two expressions.
    pub fn union(&mut self, lhs: Expr, rhs: Expr) {
        self.0.push(Command::Action(Action::Union(span!(), lhs, rhs)));
    }

    /// Runs the program in the given e-graph, consuming the program.
    pub fn run_in(self, egraph: &mut EGraph) -> Result<Vec<String>, Error> {
        egraph.run_program(self.0)
    }

    /// Runs the program and returns whether all checks were successful.
    ///
    /// Any errors besides check failures are handled normally.
    pub fn check_in(self, egraph: &mut EGraph) -> Result<bool, Error> {
        match self.run_in(egraph) {
            Ok(_) => Ok(true),
            Err(Error::CheckError(_, _)) => Ok(false),
            Err(error) => Err(error),
        }
    }
}

/// Simplified egglog AST node for a rewrite.
pub struct CommandRewrite {
    /// Rule set to which the rewrite belongs.
    pub ruleset: Symbol,
    /// Left-hand side of rewrite.
    pub lhs: Expr,
    /// Right-hand side of rewrite.
    pub rhs: Expr,
}

impl From<CommandRewrite> for Command {
    fn from(rule: CommandRewrite) -> Self {
        Command::Rewrite(
            rule.ruleset,
            Rewrite {
                span: span!(),
                lhs: rule.lhs,
                rhs: rule.rhs,
                conditions: vec![],
            },
            false,
        )
    }
}

/// Simplified egglog AST node for a rule.
pub struct CommandRule {
    /// Rule set to which the rule belongs.
    pub ruleset: Symbol,
    /// Head of rule.
    pub head: Vec<Action>,
    /// Body of rule.
    pub body: Vec<Fact>,
}

impl From<CommandRule> for Command {
    fn from(rule: CommandRule) -> Self {
        Command::Rule {
            name: "".into(),
            ruleset: rule.ruleset,
            rule: Rule {
                span: span!(),
                head: Actions::new(rule.head),
                body: rule.body,
            },
        }
    }
}
