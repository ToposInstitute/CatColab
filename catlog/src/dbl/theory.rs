/*! Double theories.

A double theory specifies, via equational axioms, a categorical structure,
namley a category (or categories) equipped with extra structure. The spirit of
the formalism is that a double theory is "just" a double category, categorifying
Lawvere's idea that a theory is "just" a category. Nevertheless, double theories
come with intuitions more specific than those attached to an arbitrary double
category. To bring these out, the interface for double theories, [`DblTheory`],
introduces new terminology compared to the references cited below.

# Terminology

A double theory comprises four kinds of things:

1. **Object type**, interpreted in models as a set of objects.

2. **Morphism type**, having a source and atarget object type and interpreted in
   models as a span of morphisms (or
   [heteromorphisms](https://ncatlab.org/nlab/show/heteromorphism)) between sets
   of objects.

3. **Object operation**, interpreted in models as a function between sets of
   objects.

4. **Morphism operation**, having a source and target object operation and
   interpreted in models as map between spans of morphisms.

The dictionary between the type-theoretic and double-categorical terminology is
summarized by the table:

| Double theory      | Double category           | Interpreted as |
|--------------------|---------------------------|----------------|
| Object type        | Object                    | Set            |
| Morphism type      | Proarrow (loose morphism) | Span of sets   |
| Object operation   | Arrow (tight morphism)    | Function       |
| Morphism operation | Cell                      | Map of spans   |

Models of a double theory are always *categorical* structures, rather than
merely *set-theoretical* ones, because each object type is interpreted not just
as a set of objects but also as a set of morphisms between those objects,
constituting a category. To achieve this, each object type in the double theory
has a distinguished morphism or "hom" type ([`hom_type`](DblTheory::hom_type)).
Similarly, all object operations become functorial since they are associated
with a distinguished operation on morphisms ([`hom_op`](DblTheory::hom_op)).

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
    type HomType;

    /** Rust type of operations on objects in the double theory.

    Viewing the theory as a double category, this is the type of arrows.
    */
    type ObOp;

    /** Rust type of operations on morphisns in the double theory.

    Viewing the theory as a double category, this is the type of cells.
    */
    type HomOp;

    /// Source of morphism type.
    fn src(&self, m: &Self::HomType) -> Self::ObType;

    /// Target of morphism type.
    fn tgt(&self, m: &Self::HomType) -> Self::ObType;

    /// Domain of operation on objects.
    fn dom(&self, f: &Self::ObOp) -> Self::ObType;

    /// Codomain of operation on objects.
    fn cod(&self, f: &Self::ObOp) -> Self::ObType;

    /// Source operation of operation on morphisms.
    fn op_src(&self, α: &Self::HomOp) -> Self::ObOp;

    /// Target operation of operation on morphisms.
    fn op_tgt(&self, α: &Self::HomOp) -> Self::ObOp;

    /// Domain type of operation on morphisms.
    fn op_dom(&self, α: &Self::HomOp) -> Self::HomType;

    /// Codomain type of operation on morphisms.
    fn op_cod(&self, α: &Self::HomOp) -> Self::HomType;

    /// Composes a sequence of morphism types.
    fn compose_types(
        &self,
        path: Path<Self::ObType, Self::HomType>
    ) -> Self::HomType;

    /** Type of morphism associated with object type.

    Viewing the theory as a double category, this is the identity proarrow on an
    object.
    */
    fn hom_type(&self, x: Self::ObType) -> Self::HomType {
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
    fn hom_op(&self, f: Self::ObOp) -> Self::HomOp;
}
