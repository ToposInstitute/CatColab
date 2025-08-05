//! Traits concerning quoting and elaboration.

/** An elaborator.

Elaboration is the process of transforming notation (as declared in
notebook-types) into syntax and values. This can possibly fail. Eventually, this
struct may have some role to play in accumulating errors, but for now it is a
singleton.
 */
pub struct Elaborator;

/** A type that can elaborated into another.

Says that objects of type `T` can be elaborated into objects of type `S`.
 */
pub trait CanElaborate<T, S> {
    /// Transform notation into syntax.
    fn elab(&self, x: &T) -> Result<S, String>;
}

/** A quoter.

Quotation is the process of transformation syntax or values into notation.
Unlike elaboration, quotation is infallible.
 */
pub struct Quoter;

/** A typed that quoted into another.

Says that objects of type `T` can be quoted as objects of type `S`.
 */
pub trait CanQuote<T, S> {
    /// Transform syntax or value into notation.
    fn quote(&self, x: &T) -> S;
}
