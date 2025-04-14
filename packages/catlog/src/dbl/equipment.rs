/*!
Virtual Equipments

This module defines the VEquipment trait and associated implementations,
types traits.
*/

use super::category::*;
use crate::one::path::Path;

/**
nw         ne
|          |
w          e
|          |
sw----s----se
**/
pub struct Niche<V, E, ProE> {
    nw: V,
    ne: V,
    sw: V,
    se: V,
    w: E,
    e: E,
    s: ProE,
}

// todo: maybe implementation of VDblGraph for Niche?

/// A trait for virtual equipments that extends the VDblCategory trait
pub trait VEquipment: VDblCategory {
    /// Restriction
    fn restrict(&self, n: Niche<Self::Ob, Self::Arr, Self::Pro>) -> Self::Cell;
}

impl VEquipment for WalkingCategory {
    fn restrict(&self, _n: Niche<Self::Ob, Self::Arr, Self::Pro>) -> Self::Cell {
        1
    }
}

impl VEquipment for WalkingBimodule::Main {
    fn restrict(&self, n: Niche<Self::Ob, Self::Arr, Self::Pro>) -> Self::Cell {
        Path::single(n.s)
    }
}

// ================================================================
// THEORIES
// ================================================================

/*
All discrete double theories are automatically equipment theories, since
restrictions along identities always exist (and is given by an identity).

However, "discrete tabulator theories" have non-identity operations, so such a
theory being an equipment is non-trivial. Below we define a structure
representing the data of such a "DET" theory, presented by a collection of
generating objects, 'V' and morphisms, 'E'.
*/

/// Object type in a discrete theory with tabs and restrictions
/// (same as 'TabObType')
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum DETObType<V, E> {
    /// Basic or generating object type.
    Basic(V),

    /// Tabulator of a morphism type.
    Tabulator(Box<DETMorType<V, E>>),
}

/// Morphism type in DET theory
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum DETMorType<V, E> {
    /// Basic or generating morphism type.
    Basic(E),

    /// Hom type on an object type.
    Hom(Box<DETObType<V, E>>),

    /// restriction along vertical morphisms
    Res {
        /// object op to the source of restrictee
        source_op: Box<DETObOp<V, E>>,
        /// object op to the target of restrictee
        target_op: Box<DETObOp<V, E>>,
        /// morphism to be restricted
        morph: Box<DETObOp<V, E>>,
    },
}

/// Projection onto object type in a DET theory.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum DETObProj<V, E> {
    /// Projection from tabulator onto source of morphism type.
    Src(DETMorType<V, E>),

    /// Projection from tabulator onto target of morphism type.
    Tgt(DETMorType<V, E>),
}

impl<V, E> DETObProj<V, E> {
    /// Morphism type that the tabulator is of.
    pub fn mor_type(&self) -> &DETMorType<V, E> {
        match self {
            DETObProj::Src(m) | DETObProj::Tgt(m) => m,
        }
    }
}

/// Operation on objects in a DET theory.
pub type DETObOp<V, E> = Path<DETObType<V, E>, DETObProj<V, E>>;

/// Projection onto morphism type in a DET theory.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DETMorProj<V, E> {
    /// Projection from a tabulator onto the original morphism type.
    Cone(DETMorType<V, E>),

    /// Projection from tabulator onto source of morphism type.
    Src(DETMorType<V, E>),

    /// Projection from tabulator onto target of morphism type.
    Tgt(DETMorType<V, E>),
}

impl<V, E> DETMorProj<V, E> {
    /// Morphism type that the tabulator is of.
    pub fn mor_type(&self) -> &DETMorType<V, E> {
        match self {
            DETMorProj::Cone(m) | DETMorProj::Src(m) | DETMorProj::Tgt(m) => m,
        }
    }

    /// Source projection.
    fn src(self) -> DETObProj<V, E> {
        match self {
            DETMorProj::Cone(m) | DETMorProj::Src(m) => DETObProj::Src(m),
            DETMorProj::Tgt(m) => DETObProj::Tgt(m),
        }
    }

    /// Target projection
    fn tgt(self) -> DETObProj<V, E> {
        match self {
            DETMorProj::Src(m) => DETObProj::Src(m),
            DETMorProj::Cone(m) | DETMorProj::Tgt(m) => DETObProj::Tgt(m),
        }
    }
}

/// Operation on morphisms in a DET theory
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DETMorOp<V, E> {
    dom: Path<DETObType<V, E>, DETMorType<V, E>>,
    projections: Vec<DETMorProj<V, E>>,
}

//todo: finish this...

#[cfg(test)]

mod tests {
    use super::*;

    #[test]
    fn walking_cat() {
        let v_eq = WalkingCategory();
        let niche = Niche {
            nw: (),
            ne: (),
            sw: (),
            se: (),
            w: (),
            e: (),
            s: (),
        };
        assert_eq!(v_eq.restrict(niche), 1)
    }

    #[test]
    fn walking_bimod() {
        let w_bm = WalkingBimodule::Main();
        let niche = Niche {
            nw: WalkingBimodule::Ob::Left,
            ne: WalkingBimodule::Ob::Right,
            sw: WalkingBimodule::Ob::Left,
            se: WalkingBimodule::Ob::Right,
            w: WalkingBimodule::Ob::Left,
            e: WalkingBimodule::Ob::Right,
            s: WalkingBimodule::Pro::Middle,
        };
        assert_eq!(w_bm.restrict(niche), Path::single(WalkingBimodule::Pro::Middle))
    }
}
