//! Code for passing around LaTeX representations of data.
//!
//! We reserve the std::Display trait for unicode-style display of mathematical
//! objects, so here we provide structure for passing around LaTeX code for such.
//!
//! N.B. Although the software is called LaTeX we will consistently ignore the
//! "correct" capitalisation and simply write latex or Latex in our code.

use std::fmt;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// We should mark which strings are to be parsed as LaTeX.
#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Latex(pub String);

/// Implement Display for Latex by simply printing out the string it contains.
impl fmt::Display for Latex {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
/// An equation in LaTeX format with a left-hand side and a right-hand side.
pub struct LatexEquation {
    /// The left-hand side of the equation.
    pub lhs: Latex,
    /// The right-hand side of the equation.
    pub rhs: Latex,
}

/// Symbolic equations in LaTeX format.
#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct LatexEquations(pub Vec<LatexEquation>);

/// An object that can be rendered to LaTeX.
pub trait ToLatex {
    /// Convert the object to its LaTeX representation.
    fn to_latex(&self) -> Latex;
}


// TODO: a trait that says "you must tell me how to format objects and morphisms"
//       i.e. something that
//          latex_ob_names_mass_action
//       and
//          latex_mor_names_mass_action
//       which should be implemented on PolynomialSystem (?) by each analysis (??)
//       ... look at how these two functions are used
