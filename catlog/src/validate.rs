/*! Objects that can validate themselves.

The design is loosely inspired by the
[`validator`](https://crates.io/crates/validator) package but to support
compositional validation in a library (rather than application) use case, the
validation error type is generic, rather than string-based.
 */

use nonempty::NonEmpty;

/** An object that can validate itself.

Such an object is either valid, which carries no additional information, or
invalid, as described by a nonempty list of validation errors.
 */
pub trait Validate {
    /** The type of a validation error.

    This type should usually implement [`std::error::Error`], though that is not
    required.
    */
    type ValidationError;

    /// Validates the object.
    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        match NonEmpty::collect(self.iter_invalid()) {
            Some(errors) => Err(errors),
            None => Ok(())
        }
    }

    /// Iterates over validation errors.
    fn iter_invalid(&self) -> impl Iterator<Item = Self::ValidationError>;
}
