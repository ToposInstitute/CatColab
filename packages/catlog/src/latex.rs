//! Code for passing around LaTeX representations of data.
//!
//! We reserve the `std::Display` trait for unicode-style display of mathematical
//! objects, so here we provide structure for passing around LaTeX code for such.
//!
//! N.B. Although the software is called "LaTeX" we will consistently ignore the
//! correct capitalisation and simply write latex or Latex in our code.

use duplicate::duplicate_item;
use std::fmt;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

/// We should mark which strings are to be parsed as Latex.
#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Latex(pub String);

/// Implement `Display` for Latex by simply printing out the string it contains.
impl fmt::Display for Latex {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// An object that can be rendered to Latex.
pub trait ToLatex {
    /// Convert the object to its Latex representation.
    fn to_latex(&self) -> Latex;
}

#[duplicate_item(T; [f32]; [f64]; [i8]; [i32]; [i64]; [u32]; [u64]; [usize]; [char]; [String])]
impl ToLatex for T {
    fn to_latex(&self) -> Latex {
        Latex(self.to_string())
    }
}

/// An equation in Latex format with a left-hand side and a right-hand side.
#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct LatexEquation {
    /// The left-hand side of the equation.
    pub lhs: Latex,
    /// The right-hand side of the equation.
    pub rhs: Latex,
}

/// Symbolic equations in Latex format.
#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct LatexEquations(pub Vec<LatexEquation>);
