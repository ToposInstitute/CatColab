//! Commutative algebra and polynomials.

use super::rig::{CommRing, Module};

/** A commutative algebra over a commutative ring.

TODO: As ring homomorphism.
 */
pub trait CommAlg: CommRing + Module<Ring = Self::R> {
    /// The base ring of the algebra.
    type R: CommRing;

    /// Convert an element of the base ring into an element of the algebra.
    fn from_scalar(r: Self::R) -> Self {
        Self::one() * r
    }
}
