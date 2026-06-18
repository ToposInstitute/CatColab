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

use crate::zero::QualifiedName;

/// We should mark which strings are to be parsed as Latex.
#[derive(Debug, PartialEq, Eq, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Latex(pub String);

/// Implement `Display` for Latex by simply printing out the string it contains.
impl fmt::Display for Latex {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
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

/// An object that can be rendered to Latex.
pub trait ToLatex {
    /// Convert the object to its Latex representation.
    fn to_latex(&self) -> Latex;
}

/// An object that can be rendered to Latex, with some function that can be applied to selected
/// appearances of a `QualifiedName` within the object. The main purpose of this trait is for rendering
/// the equations derived from an ODE semantics analysis, where we do not want to show UUIDs directly
/// to the frontend. For an example implementation see e.g. `catlog::src::stdlib::analyses::ode::mass_action`
/// where this is implemented for `MassActionParameter`.
pub trait ToLatexWithMap {
    /// Convert the object to its Latex representation, after applying the provided function `f` to
    /// selected `QualifiedName`. See `PolynomialSystem::to_latex_equations_with_map` for the main
    /// use of this function.
    fn to_latex_with_map<F: Fn(&QualifiedName) -> String>(&self, f: F) -> Latex;
}

/// We can recover the intended behaviour of `to_latex` by simply passing the "identity function"
/// to `to_latex_with_map`.
impl<T> ToLatex for T
where
    T: ToLatexWithMap,
{
    fn to_latex(&self) -> Latex {
        let name = |id: &QualifiedName| id.to_string();
        self.to_latex_with_map(name)
    }
}

/// We only want to apply the `f : &QualifiedName -> String` to something of type `QualifiedName`;
/// we leave any numerical or string-literal values unchanged.
#[duplicate_item(T; [f32]; [f64]; [i8]; [i32]; [i64]; [u32]; [u64]; [usize]; [char]; [String])]
impl ToLatexWithMap for T {
    fn to_latex_with_map<F: Fn(&QualifiedName) -> String>(&self, _f: F) -> Latex {
        Latex(self.to_string())
    }
}
