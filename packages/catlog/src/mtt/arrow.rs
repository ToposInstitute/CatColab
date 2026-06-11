//!  The AST which is produced by the parsing process and consumed by the
//!  checker.

use derive_more::Display;

use crate::mtt::composite::Composable;

// -----------------------------------------------------------------------------
// Generic arrow containers

#[derive(Display, Default)]
#[display("-|->")]
/// Essentially for internal use, a tag used to indicate that the arrow is a
/// pro-arrow.
pub struct ProArrowKind;

#[derive(Display, Default)]
#[display("->")]
/// Essentially for internal use, a tag used to indicate that the arrow is a
/// vertical arrow.
pub struct VerticalArrowKind;

#[derive(Display)]
#[display("{name}: {dom} {_kind} {cod}")]
/// A generic container for an arrow of a binary signature.
pub struct Arrow<O, K, N = String> {
    /// The name of the arrow.
    pub name: N,
    /// The domain data of the arrow.
    pub dom: O,
    /// The codomain data of the arrow.
    pub cod: O,
    _kind: K,
}

impl<O: Clone, K: Default, N: Clone> Clone for Arrow<O, K, N> {
    fn clone(&self) -> Arrow<O, K, N> {
        Arrow {
            name: self.name.clone(),
            dom: self.dom.clone(),
            cod: self.cod.clone(),
            _kind: K::default(),
        }
    }
}

impl<O, K: Default, N> Arrow<O, K, N> {
    /// The only public way to construct an arrow.
    pub fn from(name: N, dom: O, cod: O) -> Arrow<O, K, N> {
        Arrow { name, dom, cod, _kind: K::default() }
    }
}

impl<O: PartialEq + std::fmt::Display, K: std::fmt::Display, N> Composable for Arrow<O, K, N> {
    fn composable(&self, next: &Arrow<O, K, N>) -> bool {
        self.cod == next.dom
    }
}
