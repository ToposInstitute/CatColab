/*! Double theories.

A double theory specifies a categorical structure, meaning a category (or
categories) equipped with extra structure. The spirit of the formalism is that a
double theory is "just" a [virtual double category](super::category),
categorifying Lawvere's idea that a theory is "just" a category. Thus, a double
theory is a [concept with an
attitude](https://ncatlab.org/nlab/show/concept+with+an+attitude). To bring out
these intuitions, the interface for double theories, [`DblTheory`], introduces
new terminology compared to the references cited below.

# Terminology

A double theory comprises four kinds of things:

1. **Object type**, interpreted in models as a set of objects.

2. **Morphism type**, having a source and a target object type and interpreted
   in models as a span of morphisms (or
   [heteromorphisms](https://ncatlab.org/nlab/show/heteromorphism)) between sets
   of objects.

3. **Object operation**, interpreted in models as a function between sets of
   objects.

4. **Morphism operation**, having a source and target object operation and
   interpreted in models as map between spans of morphisms.

The dictionary between the type-theoretic and double-categorical terminology is
summarized by the table:

| Associated type                 | Double theory      | Double category           | Interpreted as |
|---------------------------------|--------------------|---------------------------|----------------|
| [`ObType`](DblTheory::ObType)   | Object type        | Object                    | Set            |
| [`MorType`](DblTheory::MorType) | Morphism type      | Proarrow (loose morphism) | Span           |
| [`ObOp`](DblTheory::ObOp)       | Object operation   | Arrow (tight morphism)    | Function       |
| [`MorOp`](DblTheory::MorOp)     | Morphism operation | Cell                      | Map of spans   |

Models of a double theory are *categorical* structures, rather than merely
*set-theoretical* ones, because each object type is assigned not just a set of
objects but also a span of morphisms between those objects, constituting a
category. The morphisms come from a distinguished "Hom" morphism type for each
object type in the double theory. Similarly, each object operation is not just a
function but a functor because it comes with an "Hom" operation between the Hom
types. Moreover, morphism types can be composed to give new ones, as summarized
by the table:

| Method                                      | Double theory          | Double category        |
|---------------------------------------------|------------------------|------------------------|
| [`hom_type`](DblTheory::hom_type)           | Hom type               | Identity proarrow      |
| [`hom_op`](DblTheory::hom_op)               | Hom operation          | Identity cell on arrow |
| [`compose_types`](DblTheory::compose_types) | Compose morphism types | Compose proarrows      |

Finally, operations on both objects and morphisms have identities and can be
composed:

| Method                                          | Double theory                       | Double category           |
|-------------------------------------------------|-------------------------------------|---------------------------|
| [`id_ob_op`](DblTheory::id_ob_op)               | Identity operation on object type   | Identity arrow            |
| [`id_mor_op`](DblTheory::id_mor_op)             | Identity operation on morphism type | Identity cell on proarrow |
| [`compose_ob_ops`](DblTheory::compose_ob_ops)   | Compose object operations           | Compose arrows            |
| [`compose_mor_ops`](DblTheory::compose_mor_ops) | Compose morphism operations         | Compose cells             |

# References

- [Lambert & Patterson, 2024](crate::refs::CartDblTheories)
- [Patterson, 2024](crate::refs::DblProducts),
  Section 10: Finite-product double theories
*/

use nonempty::NonEmpty;

use super::{category::*, graph::InvalidVDblGraph, tree::*};
use crate::one::{InvalidPathEq, Path, tree::OpenTree};
use crate::zero::QualifiedName;

pub use super::discrete::theory::*;
pub use super::discrete_tabulator::theory::*;
pub use super::modal::theory::*;

/** A double theory.

A double theory is "just" a virtual double category (VDC) assumed to have units.
Reflecting this, this trait has a blanket implementation for any
[`VDblCategory`]. It is not recommended to implement this trait directly.

See the [module-level docs](super::theory) for background on the terminology.
 */
pub trait DblTheory {
    /** Rust type of object types in the theory.

    Viewing the double theory as a virtual double category, this is the type of
    objects.
    */
    type ObType: Eq + Clone;

    /** Rust type of morphism types in the theory.

    Viewing the double theory as a virtual double category, this is the type of
    proarrows.
    */
    type MorType: Eq + Clone;

    /** Rust type of operations on objects in the double theory.

    Viewing the double theory as a virtual double category, this is the type of
    arrows.
    */
    type ObOp: Eq + Clone;

    /** Rust type of operations on morphisms in the double theory.

    Viewing the double theory as a virtual double category, this is the type of
    cells.
    */
    type MorOp: Eq + Clone;

    /// Does the object type belong to the theory?
    fn has_ob_type(&self, x: &Self::ObType) -> bool;

    /// Does the morphism type belong to the theory?
    fn has_mor_type(&self, m: &Self::MorType) -> bool;

    /// Does the object operation belong to the theory?
    fn has_ob_op(&self, f: &Self::ObOp) -> bool;

    /// Does the morphism operation belong to the theory?
    fn has_mor_op(&self, α: &Self::MorOp) -> bool;

    /// Source of a morphism type.
    fn src_type(&self, m: &Self::MorType) -> Self::ObType;

    /// Target of a morphism type.
    fn tgt_type(&self, m: &Self::MorType) -> Self::ObType;

    /// Domain of an operation on objects.
    fn ob_op_dom(&self, f: &Self::ObOp) -> Self::ObType;

    /// Codomain of an operation on objects.
    fn ob_op_cod(&self, f: &Self::ObOp) -> Self::ObType;

    /// Source operation of an operation on morphisms.
    fn src_op(&self, α: &Self::MorOp) -> Self::ObOp;

    /// Target operation of an operation on morphisms.
    fn tgt_op(&self, α: &Self::MorOp) -> Self::ObOp;

    /// Domain of an operation on morphisms, a path of morphism types.
    fn mor_op_dom(&self, α: &Self::MorOp) -> Path<Self::ObType, Self::MorType>;

    /// Codomain of an operation on morphisms, a single morphism type.
    fn mor_op_cod(&self, α: &Self::MorOp) -> Self::MorType;

    /// Composes a sequence of morphism types, if they have a composite.
    fn compose_types(&self, path: Path<Self::ObType, Self::MorType>) -> Option<Self::MorType>;

    /** Hom morphism type on an object type.

    Viewing the double theory as a virtual double category, this is the unit
    proarrow on an object.
    */
    fn hom_type(&self, x: Self::ObType) -> Self::MorType {
        self.compose_types(Path::Id(x))
            .expect("A double theory should have a hom type for each object type")
    }

    /// Compose a sequence of operations on objects.
    fn compose_ob_ops(&self, path: Path<Self::ObType, Self::ObOp>) -> Self::ObOp;

    /** Identity operation on an object type.

    View the double theory as a virtual double category, this is the identity
    arrow on an object.
    */
    fn id_ob_op(&self, x: Self::ObType) -> Self::ObOp {
        self.compose_ob_ops(Path::Id(x))
    }

    /** Hom morphism operation on an object operation.

    Viewing the double theory as a virtual double category, this is the unit
    cell on an arrow.
     */
    fn hom_op(&self, f: Self::ObOp) -> Self::MorOp;

    /// Compose operations on morphisms.
    fn compose_mor_ops(&self, tree: DblTree<Self::ObOp, Self::MorType, Self::MorOp>)
    -> Self::MorOp;

    /** Identity operation on a morphism type.

    Viewing the double theory as a virtual double category, this is the identity
    cell on a proarrow.
    */
    fn id_mor_op(&self, m: Self::MorType) -> Self::MorOp {
        self.compose_mor_ops(DblTree::empty(m))
    }
}

impl<VDC: VDCWithComposites> DblTheory for VDC {
    type ObType = VDC::Ob;
    type MorType = VDC::Pro;
    type ObOp = VDC::Arr;
    type MorOp = VDC::Cell;

    fn has_ob_type(&self, x: &Self::ObType) -> bool {
        self.has_ob(x)
    }
    fn has_mor_type(&self, m: &Self::MorType) -> bool {
        self.has_proarrow(m)
    }
    fn has_ob_op(&self, f: &Self::ObOp) -> bool {
        self.has_arrow(f)
    }
    fn has_mor_op(&self, α: &Self::MorOp) -> bool {
        self.has_cell(α)
    }

    fn src_type(&self, m: &Self::MorType) -> Self::ObType {
        self.src(m)
    }
    fn tgt_type(&self, m: &Self::MorType) -> Self::ObType {
        self.tgt(m)
    }
    fn ob_op_dom(&self, f: &Self::ObOp) -> Self::ObType {
        self.dom(f)
    }
    fn ob_op_cod(&self, f: &Self::ObOp) -> Self::ObType {
        self.cod(f)
    }

    fn src_op(&self, α: &Self::MorOp) -> Self::ObOp {
        self.cell_src(α)
    }
    fn tgt_op(&self, α: &Self::MorOp) -> Self::ObOp {
        self.cell_tgt(α)
    }
    fn mor_op_dom(&self, α: &Self::MorOp) -> Path<Self::ObType, Self::MorType> {
        self.cell_dom(α)
    }
    fn mor_op_cod(&self, α: &Self::MorOp) -> Self::MorType {
        self.cell_cod(α)
    }

    fn compose_types(&self, path: Path<Self::ObType, Self::MorType>) -> Option<Self::MorType> {
        self.composite(path)
    }
    fn hom_type(&self, x: Self::ObType) -> Self::MorType {
        self.unit(x).expect("A double theory should have all hom types")
    }
    fn hom_op(&self, f: Self::ObOp) -> Self::MorOp {
        let y = self.cod(&f);
        let y_ext = self.unit_ext(y).expect("Codomain of arrow should have hom type");
        let cell = self.compose_cells(DblTree(
            OpenTree::linear(vec![DblNode::Spine(f), DblNode::Cell(y_ext)]).unwrap(),
        ));
        self.through_unit(cell, 0).expect("Domain of arrow should have hom type")
    }

    fn compose_ob_ops(&self, path: Path<Self::ObType, Self::ObOp>) -> Self::ObOp {
        self.compose(path)
    }
    fn id_ob_op(&self, x: Self::ObType) -> Self::ObOp {
        self.id(x)
    }

    fn compose_mor_ops(
        &self,
        tree: DblTree<Self::ObOp, Self::MorType, Self::MorOp>,
    ) -> Self::MorOp {
        self.compose_cells(tree)
    }
    fn id_mor_op(&self, m: Self::MorType) -> Self::MorOp {
        self.id_cell(m)
    }
}

/// A failure of a double theory to be well defined.
#[derive(Debug)]
pub enum InvalidDblTheory {
    /// Morphism type with an invalid source type.
    SrcType(QualifiedName),

    /// Morphism type with an invalid target type.
    TgtType(QualifiedName),

    /// Object operation with an invalid domain.
    ObOpDom(QualifiedName),

    /// Object operation with an invalid codomain.
    ObOpCod(QualifiedName),

    /// Morphism operation with an invalid domain.
    MorOpDom(QualifiedName),

    /// Morphism operation with an invalid codomain.
    MorOpCod(QualifiedName),

    /// Morphism operation with an invalid source operation.
    SrcOp(QualifiedName),

    /// Morphism operation with an invalid target operation.
    TgtOp(QualifiedName),

    /// Morphism operation having a boundary with incompatible corners.
    MorOpBoundary(QualifiedName),

    /// Equation between morphism types with one or more errors.
    MorTypeEq(usize, NonEmpty<InvalidPathEq>),

    /// Equation between object operations with one or more errors.
    ObOpEq(usize, NonEmpty<InvalidPathEq>),
}

impl From<InvalidVDblGraph<QualifiedName, QualifiedName, QualifiedName>> for InvalidDblTheory {
    fn from(err: InvalidVDblGraph<QualifiedName, QualifiedName, QualifiedName>) -> Self {
        match err {
            InvalidVDblGraph::Dom(id) => InvalidDblTheory::ObOpDom(id),
            InvalidVDblGraph::Cod(id) => InvalidDblTheory::ObOpCod(id),
            InvalidVDblGraph::Src(id) => InvalidDblTheory::SrcType(id),
            InvalidVDblGraph::Tgt(id) => InvalidDblTheory::TgtType(id),
            InvalidVDblGraph::SquareDom(id) => InvalidDblTheory::MorOpDom(id),
            InvalidVDblGraph::SquareCod(id) => InvalidDblTheory::MorOpCod(id),
            InvalidVDblGraph::SquareSrc(id) => InvalidDblTheory::SrcOp(id),
            InvalidVDblGraph::SquareTgt(id) => InvalidDblTheory::TgtOp(id),
            InvalidVDblGraph::NotSquare(id) => InvalidDblTheory::MorOpBoundary(id),
        }
    }
}
