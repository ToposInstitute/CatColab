/*! Double theories.

A double theory axiomatically specifies a category (or categories) equipped with
extra structure. The spirit of the formalism is that a double theory is "just" a
double category, categorifying Lawvere's idea that a theory is "just" a
category. Nevertheless, double theories come with intuitions more specific than
those attached to an arbitrary double category. To bring these out, the
interface for double theories ([`DblTheory`]) introduces new terminology
compared to the references cited below. A double theory comprises four kinds of
things:

1. **Object type**, interpreted in models as a set of objects.

2. **Morphism type**, having a source and target object type and interpreted in
   models as a span of morphisms (or
   [heteromorphisms](https://ncatlab.org/nlab/show/heteromorphism)) between
   sets of objects.

3. **Object operation**, interpreted in models as a function between sets of
   objects.

4. **Morphism operation**, having a source and target object operation and
   interpreted in models as map between spans of morphisms.

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

For an explanation of the terminology, see the module-level documentation.
 */
pub trait DblTheory {
    /// Type of object types in the double theory.
    type ObType;

    /// Type of morphism types in the double theory.
    type HomType;

    /// Type of operations on objects in the double theory.
    type ObOp;

    /// Type of operations on morphisns in the double theory.
    type HomOp;
}
