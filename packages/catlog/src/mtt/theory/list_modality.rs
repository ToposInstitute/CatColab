//! TODO: doc string

use derive_more::Display;

use crate::mtt::display_helpers::DHList;

/// A trait encompassing the combinatorial aspects of working with a "structure
/// map" for a given list modality. These structure maps are composites of modal
/// applications of η and μ.
pub trait StructureMap: Clone + PartialEq + Eq + std::fmt::Display {
    /// The modal depth of the domain of `&self`.
    fn dom_depth(&self) -> usize;

    /// The domal depth of the codomain of `&self`.
    fn cod_depth(&self) -> usize;

    /// Attempt to compose `f` with `g`, yielding `None` if this is not
    /// possible.
    fn compose(f: &Self, g: &Self) -> Option<Self>;

    /// Apply `k` outer applications of the modality to this map.
    fn outer_lift(&self, k: usize) -> Self;

    /// TODO: doc
    fn inner_lift(&self, k: usize) -> Self;

    /// TODO: doc
    fn inner_unlift(&self, k: usize) -> Option<Self>;
}

/// The pure combinatorics of a list modality.
pub trait ListModality {
    /// Whether the type should be considered as implementing a list modality and enabling the various interactions with the theory that a modality would allow for.
    const PRESENT: bool;

    /// The name of modality in question.
    const NAME: &'static str;

    /// The type of structural maps for this modality.
    type Map: StructureMap;

    /// TODO: doc
    fn admits_reindexing(target_leaf: &[usize], source_arity: usize) -> bool;
}

// -----------------------------------------------------------------------------
// NoList

/// An unconstructable type representing the abscence of a list modality.
pub enum NoList {}

/// An unconstructable type for the data of structural maps for the abscence of
/// a list modality.
#[derive(Clone, PartialEq, Eq, Display)]
pub enum NoMap {}

impl StructureMap for NoMap {
    fn dom_depth(&self) -> usize {
        match *self {}
    }
    fn cod_depth(&self) -> usize {
        match *self {}
    }
    fn compose(f: &Self, _: &Self) -> Option<Self> {
        match *f {}
    }
    fn outer_lift(&self, _: usize) -> Self {
        match *self {}
    }
    fn inner_lift(&self, _: usize) -> Self {
        match *self {}
    }
    fn inner_unlift(&self, _: usize) -> Option<Self> {
        match *self {}
    }
}

impl ListModality for NoList {
    const PRESENT: bool = false;
    const NAME: &'static str = "(no list modality)";
    type Map = NoMap;
    fn admits_reindexing(_: &[usize], _: usize) -> bool {
        false
    }
}

// -----------------------------------------------------------------------------
// PlanarList

/// The list modality corresponding to planar lists.
pub struct PlanarList;

/// The canonical epi-mono factorisation of a morphism of Δ.
#[derive(Clone, PartialEq, Eq, Display)]
#[display("({},{})∈Δ({}, {})", DHList(epi), DHList(mono), dom_depth, cod_depth)]
pub struct OrderPreservingMap {
    /// TODO: doc
    epi: Vec<usize>,
    /// TODO: doc
    mono: Vec<usize>,
    /// TODO: doc
    dom_depth: usize,
    /// TODO: doc
    cod_depth: usize,
}

impl StructureMap for OrderPreservingMap {
    fn dom_depth(&self) -> usize {
        self.dom_depth
    }
    fn cod_depth(&self) -> usize {
        self.cod_depth
    }
    fn compose(f: &Self, g: &Self) -> Option<Self> {
        if f.cod_depth != g.dom_depth {
            return None;
        }
        let h: Vec<usize> = (0..f.dom_depth).map(|i| g.mono[g.epi[f.mono[f.epi[i]]]]).collect();
        let (epi, mono) = refactor_epi_mono(&h);
        Some(OrderPreservingMap {
            epi,
            mono,
            dom_depth: f.dom_depth,
            cod_depth: g.cod_depth,
        })
    }
    fn outer_lift(&self, k: usize) -> Self {
        let (epi, mono) = outer_lift_epi_mono(&self.epi, &self.mono, k);
        OrderPreservingMap {
            epi,
            mono,
            dom_depth: self.dom_depth + k,
            cod_depth: self.cod_depth + k,
        }
    }
    fn inner_lift(&self, k: usize) -> Self {
        let (epi, mono) = inner_lift_epi_mono(&self.epi, &self.mono, self.cod_depth, k);
        OrderPreservingMap {
            epi,
            mono,
            dom_depth: self.dom_depth + k,
            cod_depth: self.cod_depth + k,
        }
    }
    fn inner_unlift(&self, k: usize) -> Option<Self> {
        let (epi, mono) =
            inner_unlift_epi_mono(&self.epi, &self.mono, self.dom_depth, self.cod_depth, k)?;
        Some(OrderPreservingMap {
            epi,
            mono,
            dom_depth: self.dom_depth - k,
            cod_depth: self.cod_depth - k,
        })
    }
}

impl ListModality for PlanarList {
    const PRESENT: bool = true;
    const NAME: &'static str = "List";
    type Map = OrderPreservingMap;
    fn admits_reindexing(target_leaf: &[usize], source_arity: usize) -> bool {
        target_leaf.len() == source_arity && target_leaf.iter().enumerate().all(|(i, &j)| i == j)
    }
}

// -----------------------------------------------------------------------------
// SymmetricList

/// The list modality corresponding to planar lists.
pub struct SymmetricList;

/// The straightforward index-based representation of a bijection.
#[derive(Clone, PartialEq, Eq, Display)]
#[display("{}∈FinBij({})", DHList(permutation), permutation.len())]
pub struct Bijection {
    /// A bijection represented as a vector, where `permutation[i]` is the
    /// target of source `i`.
    permutation: Vec<usize>,
}

impl StructureMap for Bijection {
    fn dom_depth(&self) -> usize {
        self.permutation.len()
    }
    fn cod_depth(&self) -> usize {
        self.permutation.len()
    }
    fn compose(f: &Self, g: &Self) -> Option<Self> {
        if f.permutation.len() != g.permutation.len() {
            return None;
        }
        Some(Bijection {
            permutation: f.permutation.iter().map(|&i| g.permutation[i]).collect(),
        })
    }
    fn outer_lift(&self, k: usize) -> Self {
        let mut permutation: Vec<usize> = (0..k).collect();
        permutation.extend(self.permutation.iter().map(|&v| v + k));
        Bijection { permutation }
    }
    fn inner_lift(&self, k: usize) -> Self {
        let n = self.permutation.len();
        Bijection {
            permutation: self.permutation.iter().copied().chain(n..n + k).collect(),
        }
    }
    fn inner_unlift(&self, k: usize) -> Option<Self> {
        let n = self.permutation.len();
        if k > n {
            return None;
        }
        let cutoff = n - k;
        if self.permutation[cutoff..].iter().enumerate().any(|(i, &v)| v != cutoff + i) {
            return None;
        }
        Some(Bijection {
            permutation: self.permutation[..cutoff].to_vec(),
        })
    }
}

impl ListModality for SymmetricList {
    const PRESENT: bool = true;
    const NAME: &'static str = "List";
    type Map = Bijection;
    fn admits_reindexing(target_leaf: &[usize], source_arity: usize) -> bool {
        if target_leaf.len() != source_arity {
            return false;
        }
        let mut seen = vec![false; source_arity];
        for &j in target_leaf {
            match seen.get_mut(j) {
                Some(slot) if *slot => return false,
                Some(slot) => *slot = true,
                None => return false,
            }
        }
        true
    }
}

// -----------------------------------------------------------------------------
// CartesianList

/// The list modality corresponding to cartesian lists.
pub struct CartesianList;

/// The canonical epi-mono factorisation of maps in FinSet.
#[derive(Clone, PartialEq, Eq, Display)]
#[display(
    "({},{})∈FinSet({},{})",
    DHList(epi),
    DHList(mono),
    dom_depth,
    cod_depth
)]
pub struct FiniteMap {
    /// TODO: doc --- surjection part of the epi-mono factorisation in FinSet.
    epi: Vec<usize>,
    /// TODO: doc --- injection part of the epi-mono factorisation in FinSet.
    mono: Vec<usize>,
    /// TODO: doc
    dom_depth: usize,
    /// TODO: doc
    cod_depth: usize,
}

impl StructureMap for FiniteMap {
    fn dom_depth(&self) -> usize {
        self.dom_depth
    }
    fn cod_depth(&self) -> usize {
        self.cod_depth
    }
    fn compose(f: &Self, g: &Self) -> Option<Self> {
        if f.cod_depth != g.dom_depth {
            return None;
        }
        let h: Vec<usize> = (0..f.dom_depth).map(|i| g.mono[g.epi[f.mono[f.epi[i]]]]).collect();
        let (epi, mono) = refactor_epi_mono(&h);
        Some(FiniteMap {
            epi,
            mono,
            dom_depth: f.dom_depth,
            cod_depth: g.cod_depth,
        })
    }
    fn outer_lift(&self, k: usize) -> Self {
        let (epi, mono) = outer_lift_epi_mono(&self.epi, &self.mono, k);
        FiniteMap {
            epi,
            mono,
            dom_depth: self.dom_depth + k,
            cod_depth: self.cod_depth + k,
        }
    }
    fn inner_lift(&self, k: usize) -> Self {
        let (epi, mono) = inner_lift_epi_mono(&self.epi, &self.mono, self.cod_depth, k);
        FiniteMap {
            epi,
            mono,
            dom_depth: self.dom_depth + k,
            cod_depth: self.cod_depth + k,
        }
    }
    fn inner_unlift(&self, k: usize) -> Option<Self> {
        let (epi, mono) =
            inner_unlift_epi_mono(&self.epi, &self.mono, self.dom_depth, self.cod_depth, k)?;
        Some(FiniteMap {
            epi,
            mono,
            dom_depth: self.dom_depth - k,
            cod_depth: self.cod_depth - k,
        })
    }
}

impl ListModality for CartesianList {
    const PRESENT: bool = true;
    const NAME: &'static str = "List";
    type Map = FiniteMap;
    fn admits_reindexing(target_leaf: &[usize], source_arity: usize) -> bool {
        target_leaf.iter().all(|&j| j < source_arity)
    }
}

// -----------------------------------------------------------------------------
// Shared helpers for the epi-mono encoding

/// TODO: doc
fn refactor_epi_mono(eval: &[usize]) -> (Vec<usize>, Vec<usize>) {
    let mut mono: Vec<usize> = eval.to_vec();
    mono.sort();
    mono.dedup();
    let epi: Vec<usize> = eval
        .iter()
        .map(|v| {
            mono.binary_search(v)
                .expect("eval values were inserted into mono, so they are present")
        })
        .collect();
    (epi, mono)
}

/// TODO: doc
fn outer_lift_epi_mono(epi: &[usize], mono: &[usize], k: usize) -> (Vec<usize>, Vec<usize>) {
    let new_epi: Vec<usize> = (0..k).chain(epi.iter().map(|&v| v + k)).collect();
    let new_mono: Vec<usize> = (0..k).chain(mono.iter().map(|&v| v + k)).collect();
    (new_epi, new_mono)
}

/// TODO: doc
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

/// TODO: doc
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
