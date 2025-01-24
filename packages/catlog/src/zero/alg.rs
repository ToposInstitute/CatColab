//! Commutative algebra and polynomials.

use super::rig::CommRing;

/** A commutative algebra over a commutative ring.

TODO: As ring homomorphism.
 */
pub trait CommAlg: CommRing {
    /// The base ring of the algebra.
    type R: CommRing;

    /// Convert an element of the base ring into an element of the algebra.
    fn from_scalar(r: Self::R) -> Self;

    /// Scalar multiplication of a ring element with an algebra element.
    fn scalar_mul(r: Self::R, x: Self) -> Self {
        Self::from_scalar(r) * x
    }
}
