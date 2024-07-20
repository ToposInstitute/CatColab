/*! Models of double theories.

A model of a double theory is a category (or categories) equipped with extra
structure, categorifying the familiar idea from logic that a model of a theory
is a set (or sets) equipped with extra structure. For background on double
theories, see the [`theory`](super::theory) module.

In the case of a *simple* double theory, which is just a small double category,
a **model** is a span-valued *lax* double functor. Such a model is a "lax
copresheaf," categorifying the notion of a copresheaf or set-valued functor. As
for double theories, we introduce new terminology for models to bring out the
intended intuitions.

# Terminology

A model of a double theory consists of elements of two kinds:

1. **Objects**, each assigned an object type in the theory;

2. **Morphisms**, each having a domain and a codomain object and assigned a
   morphism type in the theory, compatibly with the domain and codomain;

In addition, a model has the following operations:

- **Object action**: object operations in the theory act on objects in the model
  to produce new objects;

- **Morphism action**: morphism operations in the theory act on morphisms in
  the model to produce new morphisms, compatibly with the object action;

- **Composition**: a path of morphisms in the model has a composite morphism,
  whose type is the composite of the corresponding morphism types.
 */


/** A model of a double theory.
 */
pub trait DblModel {
    /// Rust type of object types in the double theory.
    type ObType;
}
