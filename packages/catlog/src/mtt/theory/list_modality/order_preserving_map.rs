//! [OrderPreservingMap] --- morphisms of augmented Δ, stored via their
//! canonical epi-mono factorisation. Augmented Δ is the monad classifier, and
//! so the combinatorics of the list monad's structure (η and μ) live in Δ
//! regardless of which flavour of list modality (planar, symmetric, cartesian)
//! is in play.

use std::collections::HashMap;

use derive_more::Display;

use crate::mtt::{binary_signature::BinarySignature, display_helpers::DHList};

/// The canonical epi-mono factorisation of a morphism of augmented Δ. A map of
/// the form `[dom_depth] → [cod_depth]` is stored as a pair maps `(epi, mono)`
/// where `epi: [dom_depth] ↠ [inter]`, `mono: [inter] ↪ [cod_depth]`, and both
/// are order-preserving.
#[derive(Clone, PartialEq, Eq, Display)]
#[display("({},{})∈Δ({}, {})", DHList(epi), DHList(mono), dom_depth, cod_depth)]
pub struct OrderPreservingMap {
    /// The `epi: [dom_depth] ↠ [inter]` part of the factorisation, stored as a
    /// vector so that `epi(i) = epi[i]`.
    epi: Vec<usize>,
    /// The `mono: [inter] ↪ [cod_depth]`part of the factorisation, stored as a
    /// vector so that `mono(i) = mono[i]`.
    mono: Vec<usize>,
    /// The domain of the factored map.
    dom_depth: usize,
    /// The codomain of the factored map.
    cod_depth: usize,
}

impl BinarySignature<usize> for OrderPreservingMap {
    fn dom(&self) -> usize {
        self.dom_depth
    }

    fn cod(&self) -> usize {
        self.cod_depth
    }
}

impl OrderPreservingMap {
    /// Attempt to compose `f` with `g`, yielding `None` if the boundaries do
    /// not line up.
    pub fn compose(f: &Self, g: &Self) -> Option<Self> {
        if f.cod() != g.dom() {
            return None;
        }
        let h: Vec<usize> = (0..f.dom()).map(|i| g.mono[g.epi[f.mono[f.epi[i]]]]).collect();
        let (epi, mono) = refactor_epi_mono(&h);
        Some(OrderPreservingMap {
            epi,
            mono,
            dom_depth: f.dom(),
            cod_depth: g.cod(),
        })
    }

    /// Apply `k` outer applications of the modality to this map.
    pub fn outer_lift(&self, k: usize) -> Self {
        let (epi, mono) = outer_lift_epi_mono(&self.epi, &self.mono, k);
        OrderPreservingMap {
            epi,
            mono,
            dom_depth: self.dom() + k,
            cod_depth: self.cod() + k,
        }
    }

    /// Apply `k` inner applications of the modality to this map.
    pub fn inner_lift(&self, k: usize) -> Self {
        let (epi, mono) = inner_lift_epi_mono(&self.epi, &self.mono, self.cod(), k);
        OrderPreservingMap {
            epi,
            mono,
            dom_depth: self.dom() + k,
            cod_depth: self.cod() + k,
        }
    }

    /// Attempt to remove `k` outer applications of the modality from this map,
    /// yielding `None` if the `k` outermost positions do not map identity-wise.
    /// This is the inverse of [Self::outer_lift].
    pub fn outer_unlift(&self, k: usize) -> Option<Self> {
        if k > self.dom_depth || k > self.cod_depth {
            return None;
        }
        // The outer k positions of the epi must map identity-wise: epi[i] == i
        if (0..k).any(|i| self.epi[i] != i) {
            return None;
        }
        // The outer k positions of the mono must map identity-wise: mono[i] == i
        if (0..k).any(|i| self.mono[i] != i) {
            return None;
        }
        // No inner epi position may land in the outer mono block
        if self.epi[k..].iter().any(|&v| v < k) {
            return None;
        }
        let new_epi: Vec<usize> = self.epi[k..].iter().map(|&v| v - k).collect();
        let new_mono: Vec<usize> = self.mono[k..].iter().map(|&v| v - k).collect();
        Some(OrderPreservingMap {
            epi: new_epi,
            mono: new_mono,
            dom_depth: self.dom_depth - k,
            cod_depth: self.cod_depth - k,
        })
    }

    /// Attempt to remove `k` inner applications of the modality from this map,
    /// yielding None if this is not possible.
    pub fn inner_unlift(&self, k: usize) -> Option<Self> {
        let (epi, mono) = inner_unlift_epi_mono(&self.epi, &self.mono, self.dom(), self.cod(), k)?;
        Some(OrderPreservingMap {
            epi,
            mono,
            dom_depth: self.dom() - k,
            cod_depth: self.cod() - k,
        })
    }

    /// The identity map [depth] → [depth] in Δ.
    pub fn identity(depth: usize) -> Self {
        OrderPreservingMap {
            epi: (0..depth).collect(),
            mono: (0..depth).collect(),
            dom_depth: depth,
            cod_depth: depth,
        }
    }

    /// The unique map `[0] → [depth]` in Δ, which is the empty function; its
    /// epi-mono factorisation has an empty intermediate object.
    pub fn unique_eta_from_zero_to(depth: usize) -> Self {
        OrderPreservingMap {
            epi: Vec::new(),
            mono: Vec::new(),
            dom_depth: 0,
            cod_depth: depth,
        }
    }

    /// The unique map `[depth] → [1]` in Δ. For depth = 0 this is η (the
    /// empty function); for depth ≥ 1 it is the terminal map, collapsing all
    /// source positions onto position 0.
    pub fn unique_mu_to_one_from(depth: usize) -> Self {
        if depth == 0 {
            OrderPreservingMap {
                epi: Vec::new(),
                mono: Vec::new(),
                dom_depth: 0,
                cod_depth: 1,
            }
        } else {
            OrderPreservingMap {
                epi: vec![0; depth],
                mono: vec![0],
                dom_depth: depth,
                cod_depth: 1,
            }
        }
    }

    /// Whether `self` is the identity map at its (necessarily equal) domain
    /// and codomain depths.
    pub fn is_identity(&self) -> bool {
        self.dom() == self.cod() && *self == Self::identity(self.dom())
    }
}

// -----------------------------------------------------------------------------
// Combinatorial helpers on the epi-mono factorisation representation

/// Given a (not necessarily) order preserving map between ordinals, obtain its
/// epi-mono factorisation. That is, if `eval` is order-presreving then the
/// epi-mono factorisation comprosises order preserving maps too.
fn refactor_epi_mono(eval: &[usize]) -> (Vec<usize>, Vec<usize>) {
    let mut mono: Vec<usize> = eval.to_vec();
    mono.sort();
    mono.dedup();

    let invert = mono
        .iter()
        .enumerate()
        .map(|(index, item)| (*item, index))
        .collect::<HashMap<usize, usize>>();

    (eval.iter().map(|v| *invert.get(v).unwrap()).collect(), mono)
}

/// Extend an epi-mono factorisation by `k` outer positions, each mapping
/// identity-wise. This realises `k` outer applications of the modality: a map
/// `[d] → [c]` becomes `[d+k] → [c+k]`, with the `k` new outermost source
/// positions sent to the `k` new outermost target positions and the original
/// map shifted inward by `k`.
fn outer_lift_epi_mono(epi: &[usize], mono: &[usize], k: usize) -> (Vec<usize>, Vec<usize>) {
    let new_epi: Vec<usize> = (0..k).chain(epi.iter().map(|&v| v + k)).collect();
    let new_mono: Vec<usize> = (0..k).chain(mono.iter().map(|&v| v + k)).collect();
    (new_epi, new_mono)
}

/// Extend an epi-mono factorisation by `k` inner positions, each mapping
/// identity-wise. This realises `k` inner applications of the modality: a map
/// `[d] → [c]` becomes `[d+k] → [c+k]`, with the `k` new innermost source
/// positions sent through `k` new innermost intermediate positions to the `k`
/// new innermost target positions, leaving the original map untouched.
fn inner_lift_epi_mono(
    epi: &[usize],
    mono: &[usize],
    cod_depth: usize,
    k: usize,
) -> (Vec<usize>, Vec<usize>) {
    let inter = mono.len();
    let new_epi: Vec<usize> = epi.iter().copied().chain(inter..inter + k).collect();
    let new_mono: Vec<usize> = mono.iter().copied().chain(cod_depth..cod_depth + k).collect();
    (new_epi, new_mono)
}

/// Attempt to undo `k` inner applications of the modality, removing the `k`
/// innermost positions from each of the domain, intermediate, and codomain.
/// This succeeds only when those inner positions map identity-wise at both the
/// epi and mono stages and no outer source position lands in the inner
/// intermediate block; otherwise `None` is returned.
fn inner_unlift_epi_mono(
    epi: &[usize],
    mono: &[usize],
    dom_depth: usize,
    cod_depth: usize,
    k: usize,
) -> Option<(Vec<usize>, Vec<usize>)> {
    if k > dom_depth || k > mono.len() || k > cod_depth {
        return None;
    }
    let new_inter = mono.len() - k;
    let new_dom = dom_depth - k;
    let new_cod = cod_depth - k;
    // inner k positions of dom must map identity-wise to the inner k of the image
    if (0..k).any(|i| epi[new_dom + i] != new_inter + i) {
        return None;
    }
    // inner k positions of the image must map identity-wise to the inner k of cod
    if (0..k).any(|i| mono[new_inter + i] != new_cod + i) {
        return None;
    }
    // no outer source position may land in the inner image block
    if epi[..new_dom].iter().any(|&v| v >= new_inter) {
        return None;
    }
    let new_epi: Vec<usize> = epi[..new_dom].to_vec();
    let new_mono: Vec<usize> = mono[..new_inter].to_vec();
    Some((new_epi, new_mono))
}
