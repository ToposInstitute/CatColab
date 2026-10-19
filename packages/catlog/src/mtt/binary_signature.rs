//! A module for treating the domain, codomain boundary data shared by
//! everything with a binary signature.

use crate::mtt::{composite::Composite, hole::Holy};

/// Something with a domain and a codomain, both of the `Boundary` type.
pub trait BinarySignature<Boundary> {
    /// The domain endpoint.
    fn dom(&self) -> Boundary;

    /// The codomain endpoint.
    fn cod(&self) -> Boundary;
}

/// A composite spans from the domain of its first term to the codomain of its
/// last. An empty composite constrains nothing, so its endpoints are
/// unconstrained holes.
impl<A, Boundary> BinarySignature<Boundary> for Composite<A>
where
    A: BinarySignature<Boundary>,
    Boundary: Holy,
{
    fn dom(&self) -> Boundary {
        match self.iter().next() {
            Some(first) => first.dom(),
            None => Boundary::unconstrained("composite_dom".to_string()),
        }
    }

    fn cod(&self) -> Boundary {
        match self.iter().last() {
            Some(last) => last.cod(),
            None => Boundary::unconstrained("composite_cod".to_string()),
        }
    }
}
