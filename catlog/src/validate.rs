/*! Objects that can validate themselves.

The design is loosely inspired by the
[`validator`](https://crates.io/crates/validator) package, but to support the
use case of compositional validation in a library (rather than an application),
the validation error type is generic, not string-based.
 */

use nonempty::NonEmpty;

/** An object that can validate itself.

Such an object is either valid, a state which carries no additional information,
or is invalid, a state described by a nonempty list of validation errors.
 */
pub trait Validate {
    /** The type of a validation error.

    This type should usually implement [`std::error::Error`], though that is not
    required.
    */
    type ValidationError;

    /// Validates the object.
    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>>;
}

/** Collect iterator of validation errors into a `Result`.

It is common to implement [`Validate`] by constructing an iterator over
validation errors and then calling this convenience function.
*/
pub fn collect_errors<Error>(iter: impl Iterator<Item = Error>) -> Result<(), NonEmpty<Error>> {
    match NonEmpty::collect(iter) {
        Some(errors) => Err(errors),
        None => Ok(()),
    }
}
