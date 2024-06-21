/*! Double theories.

A double theory equationally specifies a categorical structure: a category (or
categories) equipped with extra structure. The spirit of the formalism is that a
double theory is "just" a double category, categorifying Lawvere's idea that a
theory is "just" a category. Nevertheless, double theories come with intuitions
more specific than those attached to an arbitrary double category. To bring
these out, the interface for double theories, [`DblTheory`], introduces new
terminology compared to the references cited below.

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

Models of a double theory are automatically *categorical* structures, rather
than merely *set-theoretical* ones, because each object type is assigned not
just a set of objects but also a span of morphisms between those objects,
constituting a category. The morphism data comes from a distinguished "Hom" type
for each object type in the double theory. Similarly, each object operation is
automatically functorial since it comes with a "Hom" operation between the Hom
types. Moreover, morphism types and operations can be composed to give new ones,
as summarized by the table:

| Method                                      | Double theory               | Double category        |
|---------------------------------------------|-----------------------------|------------------------|
| [`hom_type`](DblTheory::hom_type)           | Hom type                    | Identity proarrow      |
| [`hom_op`](DblTheory::hom_op)               | Hom operation               | Identity cell on arrow |
| [`compose_types`](DblTheory::compose_types) | Compose morphism types      | Compose proarrows      |
| `compose_hom_ops`                           | Compose morphism operations | Compose cells          |

# References

- Lambert & Patterson, 2024: Cartesian double theories: A double-categorical
  framework for categorical doctrines
  ([DOI](https://doi.org/10.1016/j.aim.2024.109630),
   [arXiv](https://arxiv.org/abs/2310.05384))
- Patterson, 2024: Products in double categories, revisited
  ([arXiv](https://arxiv.org/abs/2401.08990))
  - Section 10: Finite-product double theories
*/

use crate::one::path::Path;

/** A double theory.

The terminology used here is explained at greater length in the
[module-level](super::theory) docs.
 */
pub trait DblTheory {
    /** Rust type of object types in the double theory.

    Viewing the theory as a double category, this is the type of objects.
    */
    type ObType;

    /** Rust type of morphism types in the double theory.

    Viewing the theory as a double category, this is the type of proarrows.
    */
    type MorType;

    /** Rust type of operations on objects in the double theory.

    Viewing the theory as a double category, this is the type of arrows.
    */
    type ObOp;

    /** Rust type of operations on morphisns in the double theory.

    Viewing the theory as a double category, this is the type of cells.
    */
    type MorOp;

    /// Source of morphism type.
    fn src(&self, m: &Self::MorType) -> Self::ObType;

    /// Target of morphism type.
    fn tgt(&self, m: &Self::MorType) -> Self::ObType;

    /// Domain of operation on objects.
    fn dom(&self, f: &Self::ObOp) -> Self::ObType;

    /// Codomain of operation on objects.
    fn cod(&self, f: &Self::ObOp) -> Self::ObType;

    /// Source operation of operation on morphisms.
    fn op_src(&self, α: &Self::MorOp) -> Self::ObOp;

    /// Target operation of operation on morphisms.
    fn op_tgt(&self, α: &Self::MorOp) -> Self::ObOp;

    /// Domain type of operation on morphisms.
    fn op_dom(&self, α: &Self::MorOp) -> Self::MorType;

    /// Codomain type of operation on morphisms.
    fn op_cod(&self, α: &Self::MorOp) -> Self::MorType;

    /// Composes a sequence of morphism types.
    fn compose_types(
        &self,
        path: Path<Self::ObType, Self::MorType>
    ) -> Self::MorType;

    /** Type of morphism associated with object type.

    Viewing the theory as a double category, this is the identity proarrow on an
    object.
    */
    fn hom_type(&self, x: Self::ObType) -> Self::MorType {
        self.compose_types(Path::Id(x))
    }

    /// Compose a sequence of operations on objects.
    fn compose_ob_ops(
        &self,
        path: Path<Self::ObType, Self::ObOp>
    ) -> Self::ObOp;

    /** Identity operation on an object type.

    View the theory as a double category, this is the identity arrow on an
    object.
    */
    fn id_ob_op(&self, x: Self::ObType) -> Self::ObOp {
        self.compose_ob_ops(Path::Id(x))
    }

    /** Operation on morphisms associated with object operation.

    Viewing the theory as a double category, this is the identity cell on an
    arrow.
    */
    fn hom_op(&self, f: Self::ObOp) -> Self::MorOp;
}
