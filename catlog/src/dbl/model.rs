/*! Models of double theories.

A model of a double theory is a category (or categories) equipped with
operations specified by the theory, categorifying the familiar idea from logic
that a model of a theory is a set (or sets) equipped with operations. For
background on double theories, see the [`theory`](super::theory) module.

In the case of a *simple* double theory, which is just a small double category,
a **model** of the theory is a span-valued *lax* double functor out of it. Such
a model is a "lax copresheaf," categorifying the notion of a copresheaf or
set-valued functor. Though they are "just" lax double functors, models are a
[concept with an
attitude](https://ncatlab.org/nlab/show/concept+with+an+attitude). To bring out
the intended intuition we introduce new jargon, building on that for double
theories.

# Terminology

A model of a double theory consists of elements of two kinds:

1. **Objects**, each assigned an object type in the theory;

2. **Morphisms**, each having a domain and a codomain object and assigned a
   morphism type in the theory, compatibly with the domain and codomain types;

In addition, a model has the following operations:

- **Object action**: object operations in the theory act on objects in the model
  to produce new objects;

- **Morphism action**: morphism operations in the theory act on morphisms in
  the model to produce new morphisms, compatibly with the object action;

- **Composition**: a path of morphisms in the model has a composite morphism,
  whose type is the composite of the corresponding morphism types.
 */

use std::hash::Hash;
use std::sync::Arc;

use crate::zero::{Mapping, IndexedHashColumn};
use crate::one::{Category, Path};
use crate::one::fin_category::FpCategory;
use super::theory::DblTheory;


/** A model of a double theory.

As always in logic, a model makes sense only relative to a theory, but a theory
can have many different models. Thus, in Rust, a model generally needs access to
its theory but should not own its theory. Implementors of this trait can use an
immutable shared reference to the theory.
 */
pub trait DblModel {
    /** Type of objects in the model.

    Viewing the model as a span-valued double functor, this is the type of
    elements in the sets in the image of the functor.
    */
    type Ob: Eq;

    /** Type of morphisms in the model.

    Viewing the model as a span-valued double functor, this is the type of
    elements in the apexes of the spans in the image of the functor.
    */
    type Mor: Eq;

    /// Rust type of object types in the double theory.
    type ObType: Eq;

    /// Rust type of morphism types in the double theory.
    type MorType: Eq;

    /// Rust type of operations on objects.
    type ObOp: Eq;

    /// Rust type of operations on morphisms.
    type MorOp: Eq;

    /// Does the model contain the value as an object?
    fn has_ob(&self, x: &Self::Ob) -> bool;

    /// Does the model contain the value as a morphism?
    fn has_mor(&self, m: &Self::Mor) -> bool;

    /// Type of object.
    fn ob_type(&self, x: &Self::Ob) -> Self::ObType;

    /// Type of morphism.
    fn mor_type(&self, m: &Self::Mor) -> Self::MorType;

    /// Domain of morphism.
    fn dom(&self, m: &Self::Mor) -> Self::Ob;

    /// Codomain of morphism.
    fn cod(&self, m: &Self::Mor) -> Self::Ob;

    /// Composes a path of morphisms in the model.
    fn compose(&self, path: Path<Self::Ob,Self::Mor>) -> Self::Mor;

    /// Composes a pair of morphisms in the model.
    fn compose2(&self, m: Self::Mor, n: Self::Mor) -> Self::Mor {
        self.compose(Path::pair(m, n))
    }

    /// Constructs the identity morphism at an object.
    fn id(&self, x: Self::Ob) -> Self::Mor {
        self.compose(Path::empty(x))
    }

    /// Acts on an object with an object operation.
    fn ob_act(&self, x: Self::Ob, f: &Self::ObOp) -> Self::Ob;

    /// Acts on a morphism with a morphism operation.
    fn mor_act(&self, m: Self::Mor, α: &Self::MorOp) -> Self::Mor;
}

/** A finitely generated model of a double theory.

Like the [finitely generated categories](crate::one::category::FgCategory) that
it generalizes, a finitely generated models is rarely actually finite.
 */
pub trait FgDblModel: DblModel {
    /// Is the object a generator? Implies `self.has_ob(x)`.
    fn has_ob_generator(&self, x: &Self::Ob) -> bool;

    /// Is the morphism a generator? Implies `self.has_mor(m)`.
    fn has_mor_generator(&self, m: &Self::Mor) -> bool;

    /// Iterates over object generators of the category.
    fn ob_generators(&self) -> impl Iterator<Item = Self::Ob>;

    /// Iterates over morphism generators of the category.
    fn mor_generators(&self) -> impl Iterator<Item = Self::Mor>;

    /// Iterates over morphism generators with the given domain.
    fn generators_with_dom(&self, x: &Self::Ob) -> impl Iterator<Item = Self::Mor>;

    /// Iterates over morphism generators with the given codomain.
    fn generators_with_cod(&self, x: &Self::Ob) -> impl Iterator<Item = Self::Mor>;
}


/** A finitely presented model of a discrete double theory.

Since the operations are trivial, such a model is a finite presentation of a
category sliced over the object and morphism types comprising the double theory.
A type theorist would call it a ["displayed
category"](https://ncatlab.org/nlab/show/displayed+category).
 */
#[derive(Clone)]
pub struct DiscreteDblModel<V,E,Th: DblTheory> {
    theory: Arc<Th>,
    category: FpCategory<V,E>,
    ob_types: IndexedHashColumn<V,Th::ObType>,
    mor_types: IndexedHashColumn<E,Th::MorType>,
}

impl<V,E,Th> DblModel for DiscreteDblModel<V,E,Th>
where V: Eq+Clone+Hash, E: Eq+Clone+Hash, Th: DblTheory,
      Th::ObType: Eq+Clone+Hash, Th::MorType: Eq+Clone+Hash {
    type Ob = V;
    type Mor = Path<V,E>;
    type ObType = Th::ObType;
    type MorType = Th::MorType;
    type ObOp = Th::ObType;
    type MorOp = Th::MorType;

    fn has_ob(&self, x: &Self::Ob) -> bool { self.category.has_ob(x) }
    fn has_mor(&self, m: &Self::Mor) -> bool { self.category.has_hom(m) }

    fn ob_type(&self, x: &Self::Ob) -> Self::ObType {
        self.ob_types.apply(x).expect("Object type should be set").clone()
    }

    fn mor_type(&self, m: &Self::Mor) -> Self::MorType {
        let types = m.clone().map(|x| self.ob_type(&x), |n| {
            self.mor_types.apply(&n).expect("Morphism type should be set").clone()
        });
        self.theory.compose_types(types)
    }

    fn dom(&self, m: &Self::Mor) -> Self::Ob { self.category.dom(m) }
    fn cod(&self, m: &Self::Mor) -> Self::Ob { self.category.cod(m) }
    fn compose(&self, path: Path<Self::Ob,Self::Mor>) -> Self::Mor {
        self.category.compose(path)
    }
    fn ob_act(&self, x: Self::Ob, _: &Self::ObOp) -> Self::Ob { x }
    fn mor_act(&self, m: Self::Mor, _: &Self::MorOp) -> Self::Mor { m }
}
