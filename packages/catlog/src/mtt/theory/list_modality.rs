//! TODO: doc string

use derive_more::Display;

use crate::mtt::display_helpers::DHList;

/// A trait encompassing the combinatorial aspects of working with a "structure
/// map" for a given list modality. These structure maps are composites of modal
/// applications of η and μ.
pub trait StructureMap: Clone + PartialEq + Eq + std::fmt::Display {
    /// The identity map on an iteration of the modality `depth` times.
    fn identity(depth: usize) -> Self;

    /// The modal depth of the domain of `&self`.
    fn dom_depth(&self) -> usize;

    /// The domal depth of the codomain of `&self`.
    fn cod_depth(&self) -> usize;

    /// Attempt to compose `f` with `g`, yielding `None` if this is not
    /// possible.
    fn compose(f: &Self, g: &Self) -> Option<Self>;

    /// Apply `k` outer applications of the modality to this map.
    fn lift(&self, k: usize) -> Self;

    /// If there are at least `k` outer applications of the modality to this
    /// map, remove them, otherwise return `None`.
    fn unlift(&self, k: usize) -> Option<Self>;

    /// Determine whether `&self` is the identity.
    fn is_identity(&self) -> bool;
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
    fn identity(_: usize) -> Self {
        unreachable!("NoList has no structure maps; identity cannot be constructed")
    }
    fn dom_depth(&self) -> usize {
        match *self {}
    }
    fn cod_depth(&self) -> usize {
        match *self {}
    }
    fn compose(f: &Self, _: &Self) -> Option<Self> {
        match *f {}
    }
    fn lift(&self, _: usize) -> Self {
        match *self {}
    }
    fn unlift(&self, _: usize) -> Option<Self> {
        match *self {}
    }
    fn is_identity(&self) -> bool {
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
    fn identity(depth: usize) -> Self {
        OrderPreservingMap {
            epi: (0..depth).collect(),
            mono: (0..depth).collect(),
            dom_depth: depth,
            cod_depth: depth,
        }
    }
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
        let h: Vec<usize> =
            (0..f.dom_depth).map(|i| g.mono[g.epi[f.mono[f.epi[i]]]]).collect();
        let (epi, mono) = refactor_epi_mono(&h);
        Some(OrderPreservingMap {
            epi,
            mono,
            dom_depth: f.dom_depth,
            cod_depth: g.cod_depth,
        })
    }
    fn lift(&self, k: usize) -> Self {
        let (epi, mono) = lift_epi_mono(&self.epi, &self.mono, k);
        OrderPreservingMap {
            epi,
            mono,
            dom_depth: self.dom_depth + k,
            cod_depth: self.cod_depth + k,
        }
    }
    fn unlift(&self, k: usize) -> Option<Self> {
        let (epi, mono) =
            unlift_epi_mono(&self.epi, &self.mono, self.dom_depth, self.cod_depth, k)?;
        Some(OrderPreservingMap {
            epi,
            mono,
            dom_depth: self.dom_depth - k,
            cod_depth: self.cod_depth - k,
        })
    }
    fn is_identity(&self) -> bool {
        self.dom_depth == self.cod_depth
            && self.epi.iter().enumerate().all(|(i, &j)| i == j)
            && self.mono.iter().enumerate().all(|(i, &j)| i == j)
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
    fn identity(depth: usize) -> Self {
        Bijection { permutation: (0..depth).collect() }
    }
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
    fn lift(&self, k: usize) -> Self {
        let mut permutation: Vec<usize> = (0..k).collect();
        permutation.extend(self.permutation.iter().map(|&v| v + k));
        Bijection { permutation }
    }
    fn unlift(&self, k: usize) -> Option<Self> {
        if k > self.permutation.len() {
            return None;
        }
        if self.permutation[..k].iter().enumerate().any(|(i, &v)| v != i) {
            return None;
        }
        Some(Bijection {
            permutation: self.permutation[k..].iter().map(|&v| v - k).collect(),
        })
    }
    fn is_identity(&self) -> bool {
        self.permutation.iter().enumerate().all(|(i, &j)| i == j)
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
    fn identity(depth: usize) -> Self {
        FiniteMap {
            epi: (0..depth).collect(),
            mono: (0..depth).collect(),
            dom_depth: depth,
            cod_depth: depth,
        }
    }
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
        let h: Vec<usize> =
            (0..f.dom_depth).map(|i| g.mono[g.epi[f.mono[f.epi[i]]]]).collect();
        let (epi, mono) = refactor_epi_mono(&h);
        Some(FiniteMap {
            epi,
            mono,
            dom_depth: f.dom_depth,
            cod_depth: g.cod_depth,
        })
    }
    fn lift(&self, k: usize) -> Self {
        let (epi, mono) = lift_epi_mono(&self.epi, &self.mono, k);
        FiniteMap {
            epi,
            mono,
            dom_depth: self.dom_depth + k,
            cod_depth: self.cod_depth + k,
        }
    }
    fn unlift(&self, k: usize) -> Option<Self> {
        let (epi, mono) =
            unlift_epi_mono(&self.epi, &self.mono, self.dom_depth, self.cod_depth, k)?;
        Some(FiniteMap {
            epi,
            mono,
            dom_depth: self.dom_depth - k,
            cod_depth: self.cod_depth - k,
        })
    }
    fn is_identity(&self) -> bool {
        self.dom_depth == self.cod_depth
            && self.epi.iter().enumerate().all(|(i, &j)| i == j)
            && self.mono.iter().enumerate().all(|(i, &j)| i == j)
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
    mono.sort_unstable();
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
fn lift_epi_mono(epi: &[usize], mono: &[usize], k: usize) -> (Vec<usize>, Vec<usize>) {
    let new_epi: Vec<usize> =
        (0..k).chain(epi.iter().map(|&v| v + k)).collect();
    let new_mono: Vec<usize> =
        (0..k).chain(mono.iter().map(|&v| v + k)).collect();
    (new_epi, new_mono)
}

/// TODO: doc
fn unlift_epi_mono(
    epi: &[usize],
    mono: &[usize],
    dom_depth: usize,
    cod_depth: usize,
    k: usize,
) -> Option<(Vec<usize>, Vec<usize>)> {
    if k > dom_depth || k > mono.len() || k > cod_depth {
        return None;
    }
    // outer k positions of dom must be the identity prefix of the image
    if epi[..k].iter().enumerate().any(|(i, &v)| v != i) {
        return None;
    }
    // outer k positions of the image must be the identity prefix of cod
    if mono[..k].iter().enumerate().any(|(i, &v)| v != i) {
        return None;
    }
    // no inner source position may land in the outer image block
    if epi[k..].iter().any(|&v| v < k) {
        return None;
    }
    let new_epi: Vec<usize> = epi[k..].iter().map(|&v| v - k).collect();
    let new_mono: Vec<usize> = mono[k..].iter().map(|&v| v - k).collect();
    Some((new_epi, new_mono))
}
