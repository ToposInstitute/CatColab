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
as a set of objects but has an associated set of morphisms between those
objects. To achieve this, each object type in the double theory has a
distinguished morphism or "hom" type ([`hom_type`](DblTheory::hom_type)).
Similarly, all object operations are functorial since they are associated with a
distinguished operation on morphisms ([`hom_op`](DblTheory::hom_op)).

# References

- Lambert & Patterson, 2024: Cartesian double theories: A double-categorical
  framework for categorical doctrines
  ([DOI](https://doi.org/10.1016/j.aim.2024.109630),
   [arXiv](https://arxiv.org/abs/2310.05384))
- Patterson, 2024: Products in double categories, revisited
  ([arXiv](https://arxiv.org/abs/2401.08990))
  - Section 10: Finite-product double theories
*/

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

    /// Type of morphism associated with object type.
    fn hom_type(&self, x: &Self::ObType) -> Self::HomType;

    /// Operation on morphisms associated with object operation.
    fn hom_op(&self, f: &Self::ObOp) -> Self::HomOp;
}
