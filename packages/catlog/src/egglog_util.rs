//! Utilities for working with e-graphs as implemented in egglog.

use std::fmt::Display;

use egglog::ast::{Action, Command, Expr, Fact, Schedule, Symbol};
use egglog::{EGraph, Error, span};
use ref_cast::RefCast;
use ustr::Ustr;

/** An egglog program.

This struct is just a newtype wrapper around a vector of [`Command`]s with a
builder interface.
 */
#[derive(Clone, Debug, RefCast)]
#[repr(transparent)]
pub struct Program(pub Vec<Command>);

/// Displays the program as a newline-separated sequence of S-expressions.
impl Display for Program {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for command in self.0.iter() {
            writeln!(f, "{}", command)?;
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

    /** Runs the program and returns whether all checks were successful.

    Any errors besides check failures are handled normally.
     */
    pub fn check_in(self, egraph: &mut EGraph) -> Result<bool, Error> {
        match self.run_in(egraph) {
            Ok(_) => Ok(true),
            Err(Error::CheckError(_, _)) => Ok(false),
            Err(error) => Err(error),
        }
    }
}

/** A type convertible into an egglog [`Symbol`].

The default implementation converts the object into a `String` and from that
into a `Symbol`. Some types will allow more efficient conversions.
 */
pub trait ToSymbol: ToString {
    /// Converts this object into a `Symbol`.
    fn to_symbol(&self) -> Symbol {
        self.to_string().into()
    }
}

impl ToSymbol for char {}

impl ToSymbol for String {
    fn to_symbol(&self) -> Symbol {
        self.into()
    }
}

impl ToSymbol for Symbol {
    fn to_symbol(&self) -> Symbol {
        *self
    }
}

impl ToSymbol for Ustr {
    fn to_symbol(&self) -> Symbol {
        self.as_str().into()
    }
}
