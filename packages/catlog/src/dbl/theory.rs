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
types. Morphism types can also be composed to give new ones, as summarized by
the table:

| Method                                      | Double theory               | Double category        |
|---------------------------------------------|-----------------------------|------------------------|
| [`hom_type`](DblTheory::hom_type)           | Hom type                    | Identity proarrow      |
| [`hom_op`](DblTheory::hom_op)               | Hom operation               | Identity cell on arrow |
| [`compose_types`](DblTheory::compose_types) | Compose morphism types      | Compose proarrows      |

Finally, operations on both objects and morphisms have identities and can be
composed:

| Method                                          | Double theory                       | Double category           |
|-------------------------------------------------|-------------------------------------|---------------------------|
| [`id_ob_op`](DblTheory::id_ob_op)               | Identity operation on object type   | Identity arrow            |
| [`id_mor_op`](DblTheory::id_mor_op)             | Identity operation on morphism type | Identity cell on proarrow |
| [`compose_ob_ops`](DblTheory::compose_ob_ops)   | Compose object operations           | Compose arrows            |
| [`compose_mor_ops`](DblTheory::compose_mor_ops) | Compose morphism operations         | Compose cells             |

# References

- Lambert & Patterson, 2024: Cartesian double theories: A double-categorical
  framework for categorical doctrines
  ([DOI](https://doi.org/10.1016/j.aim.2024.109630),
   [arXiv](https://arxiv.org/abs/2310.05384))
- Patterson, 2024: Products in double categories, revisited
  ([arXiv](https://arxiv.org/abs/2401.08990))
  - Section 10: Finite-product double theories
*/

use std::hash::{BuildHasher, Hash, RandomState};

use derive_more::From;
use nonempty::nonempty;
use ref_cast::RefCast;

use super::pasting::DblPasting;
use crate::one::category::*;
use crate::one::path::Path;
use crate::zero::*;

/** A double theory.

The terminology used here is explained at greater length in the
[module-level](super::theory) docs.
 */
pub trait DblTheory {
    /** Rust type of object types in the double theory.

    Viewing the theory as a double category, this is the type of objects.
    */
    type ObType: Eq;

    /** Rust type of morphism types in the double theory.

    Viewing the theory as a double category, this is the type of proarrows.
    */
    type MorType: Eq;

    /** Rust type of operations on objects in the double theory.

    Viewing the theory as a double category, this is the type of arrows.
    */
    type ObOp: Eq;

    /** Rust type of operations on morphisms in the double theory.

    Viewing the theory as a double category, this is the type of cells.
    */
    type MorOp: Eq;

    /// Does the object type belong to the theory?
    fn has_ob_type(&self, x: &Self::ObType) -> bool;

    /// Does the morphism type belong to the theory?
    fn has_mor_type(&self, m: &Self::MorType) -> bool;

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

    /// Basic object types.
    fn basic_ob_types(&self) -> impl Iterator<Item = Self::ObType>;

    /// Basic morphism types.
    fn basic_mor_types(&self) -> impl Iterator<Item = Self::MorType>;

    /// Composes a sequence of morphism types.
    fn compose_types(&self, path: Path<Self::ObType, Self::MorType>) -> Self::MorType;

    /** Hom type of an object type.

    Viewing the theory as a double category, this is the identity proarrow on an
    object.
    */
    fn hom_type(&self, x: Self::ObType) -> Self::MorType {
        self.compose_types(Path::Id(x))
    }

    /// Compose a sequence of operations on objects.
    fn compose_ob_ops(&self, path: Path<Self::ObType, Self::ObOp>) -> Self::ObOp;

    /** Identity operation on an object type.

    View the theory as a double category, this is the identity arrow on an
    object.
    */
    fn id_ob_op(&self, x: Self::ObType) -> Self::ObOp {
        self.compose_ob_ops(Path::Id(x))
    }

    /// Compose a pasting diagram of operations on morphisms.
    fn compose_mor_ops(
        &self,
        pasting: DblPasting<Self::ObType, Self::ObOp, Self::MorType, Self::MorOp>,
    ) -> Self::MorOp;

    /** Hom operation for an object operation.

    Viewing the theory as a double category, this is the identity cell on an
    arrow.
    */
    fn hom_op(&self, f: Self::ObOp) -> Self::MorOp {
        self.compose_mor_ops(DblPasting::ArrId(nonempty![f]))
    }

    /** Identity operation on a morphism type.

    Viewing the theory as a double category, this is the identity cell on a
    proarrow.
    */
    fn id_mor_op(&self, m: Self::MorType) -> Self::MorOp {
        self.compose_mor_ops(DblPasting::ProId(nonempty![m]))
    }
}

/// The set of object types of a double theory.
#[derive(From, RefCast)]
#[repr(transparent)]
pub struct ObTypeSet<Th: DblTheory>(Th);

impl<Th: DblTheory> Set for ObTypeSet<Th> {
    type Elem = Th::ObType;

    fn contains(&self, x: &Th::ObType) -> bool {
        self.0.has_ob_type(x)
    }
}

/** A discrete double theory.

A **discrete double theory** is a double theory with no nontrivial operations on
either object or morphism types. Viewed as a double category, such a theory is
indeed **discrete**, which can equivalently be defined as

- a discrete object in the 2-category of double categories
- a double category whose underlying categories are both discrete categories
*/
#[derive(From, RefCast)]
#[repr(transparent)]
pub struct DiscreteDblTheory<Cat: FgCategory>(Cat);

impl<C: FgCategory> DblTheory for DiscreteDblTheory<C>
where
    C::Ob: Clone,
    C::Hom: Clone,
{
    type ObType = C::Ob;
    type ObOp = C::Ob;
    type MorType = C::Hom;
    type MorOp = C::Hom;

    fn has_ob_type(&self, x: &Self::ObType) -> bool {
        self.0.has_ob(x)
    }
    fn has_mor_type(&self, m: &Self::MorType) -> bool {
        self.0.has_hom(m)
    }

    fn src(&self, m: &Self::MorType) -> Self::ObType {
        self.0.dom(m)
    }
    fn tgt(&self, m: &Self::MorType) -> Self::ObType {
        self.0.cod(m)
    }
    fn dom(&self, x: &Self::ObOp) -> Self::ObType {
        x.clone()
    }
    fn cod(&self, x: &Self::ObOp) -> Self::ObType {
        x.clone()
    }

    fn op_src(&self, m: &Self::MorOp) -> Self::ObOp {
        self.0.dom(m)
    }
    fn op_tgt(&self, m: &Self::MorOp) -> Self::ObOp {
        self.0.cod(m)
    }
    fn op_dom(&self, m: &Self::MorOp) -> Self::MorType {
        m.clone()
    }
    fn op_cod(&self, m: &Self::MorOp) -> Self::MorType {
        m.clone()
    }

    fn basic_ob_types(&self) -> impl Iterator<Item = Self::ObType> {
        self.0.ob_generators()
    }

    fn basic_mor_types(&self) -> impl Iterator<Item = Self::MorType> {
        self.0.hom_generators()
    }

    fn compose_types(&self, path: Path<C::Ob, C::Hom>) -> C::Hom {
        self.0.compose(path)
    }

    fn compose_ob_ops(&self, path: Path<C::Ob, C::Ob>) -> C::Ob {
        let disc = DiscreteCategory::ref_cast(ObSet::ref_cast(&self.0));
        disc.compose(path)
    }

    fn compose_mor_ops(&self, pasting: DblPasting<C::Ob, C::Ob, C::Hom, C::Hom>) -> C::Hom {
        match pasting {
            DblPasting::ObId(x) => self.0.id(x),
            DblPasting::ArrId(fs) => self.0.id(self.compose_ob_ops(Path::Seq(fs))),
            DblPasting::ProId(ms) => self.compose_types(Path::Seq(ms)),
            DblPasting::Diagram(_) => panic!("General pasting not implemented"),
        }
    }
}

/// Object type in a [discrete tabulator theory](DiscreteTabTheory).
#[derive(Eq, PartialEq, Clone)]
pub enum TabObType<V, E> {
    /// Basic or generating object type.
    Basic(V),

    /// Object type for the tabulator of a morphism type.
    Tabulator(Box<TabMorType<V, E>>),
}

/// Morphism type in a [discrete tabulator theory](DiscreteTabTheory).
#[derive(Eq, PartialEq, Clone)]
pub enum TabMorType<V, E> {
    /// Basic or generating morphism type.
    Basic(E),

    /// Hom or identity type on an object type.
    Hom(Box<TabObType<V, E>>),
}

/** A discrete tabulator theory.

Loosely speaking, a discrete tabulator theory is a [discrete double
theory](DiscreteDblTheory) extended to allow tabulators. That doesn't quite make
sense as stated because a [tabulator](https://ncatlab.org/nlab/show/tabulator)
comes with two projection arrows and a projection cell, so cannot exist in a
nontrivial discrete double category. A **discrete tabulator theory** is rather a
small double category with tabulators and with no arrows or cells except the
identities and tabulator projections.

NOTE: In defining `ObOp` and `MorOp`, we are pretending that the tabulator
projections don't exist, which seems inocuous because the projections aren't
much use on their own, but it would be more correct to put them in.
 */
pub struct DiscreteTabTheory<V, E, S = RandomState> {
    ob_types: HashFinSet<V>,
    mor_types: HashFinSet<E>,
    src: HashColumn<E, TabObType<V, E>, S>,
    tgt: HashColumn<E, TabObType<V, E>, S>,
    compose_map: HashColumn<(E, E), TabMorType<V, E>>,
}

impl<V, E, S> DiscreteTabTheory<V, E, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    S: BuildHasher,
{
    fn compose2_types(&self, f: TabMorType<V, E>, g: TabMorType<V, E>) -> TabMorType<V, E> {
        match (f, g) {
            (TabMorType::Hom(_), g) => g,
            (f, TabMorType::Hom(_)) => f,
            (TabMorType::Basic(d), TabMorType::Basic(e)) => {
                self.compose_map.apply(&(d, e)).expect("Composition should be defined").clone()
            }
        }
    }
}

impl<V, E, S> DblTheory for DiscreteTabTheory<V, E, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    S: BuildHasher,
{
    type ObType = TabObType<V, E>;
    type MorType = TabMorType<V, E>;
    type ObOp = TabObType<V, E>;
    type MorOp = TabMorType<V, E>;

    fn has_ob_type(&self, ob_type: &Self::ObType) -> bool {
        match ob_type {
            TabObType::Basic(x) => self.ob_types.contains(x),
            TabObType::Tabulator(f) => self.has_mor_type(f.as_ref()),
        }
    }

    fn has_mor_type(&self, mor_type: &Self::MorType) -> bool {
        match mor_type {
            TabMorType::Basic(e) => self.mor_types.contains(e),
            TabMorType::Hom(x) => self.has_ob_type(x.as_ref()),
        }
    }

    fn src(&self, mor_type: &Self::MorType) -> Self::ObType {
        match mor_type {
            TabMorType::Basic(e) => {
                self.src.apply(e).expect("Source of morphism type should be defined").clone()
            }
            TabMorType::Hom(x) => x.as_ref().clone(),
        }
    }

    fn tgt(&self, mor_type: &Self::MorType) -> Self::ObType {
        match mor_type {
            TabMorType::Basic(e) => {
                self.tgt.apply(e).expect("Target of morphism type should be defined").clone()
            }
            TabMorType::Hom(x) => x.as_ref().clone(),
        }
    }

    fn dom(&self, f: &Self::ObOp) -> Self::ObType {
        f.clone()
    }
    fn cod(&self, f: &Self::ObOp) -> Self::ObType {
        f.clone()
    }
    fn op_src(&self, α: &Self::MorOp) -> Self::ObOp {
        self.src(α)
    }
    fn op_tgt(&self, α: &Self::MorOp) -> Self::ObOp {
        self.tgt(α)
    }
    fn op_dom(&self, α: &Self::MorOp) -> Self::MorType {
        α.clone()
    }
    fn op_cod(&self, α: &Self::MorOp) -> Self::MorType {
        α.clone()
    }

    fn basic_ob_types(&self) -> impl Iterator<Item = Self::ObType> {
        self.ob_types.iter().map(TabObType::Basic)
    }

    fn basic_mor_types(&self) -> impl Iterator<Item = Self::MorType> {
        self.mor_types.iter().map(TabMorType::Basic)
    }

    fn compose_types(&self, path: Path<Self::ObType, Self::MorType>) -> Self::MorType {
        path.reduce(|x| self.hom_type(x), |f, g| self.compose2_types(f, g))
    }

    fn hom_type(&self, x: Self::ObType) -> Self::MorType {
        TabMorType::Hom(Box::new(x))
    }

    fn compose_ob_ops(&self, path: Path<Self::ObType, Self::ObOp>) -> Self::ObOp {
        let disc = DiscreteCategory::ref_cast(ObTypeSet::ref_cast(self));
        disc.compose(path)
    }

    fn compose_mor_ops(
        &self,
        pasting: DblPasting<Self::ObType, Self::ObOp, Self::MorType, Self::MorOp>,
    ) -> Self::MorOp {
        match pasting {
            DblPasting::ObId(x) => self.hom_type(x),
            DblPasting::ArrId(fs) => self.hom_type(self.compose_ob_ops(Path::Seq(fs))),
            DblPasting::ProId(ms) => self.compose_types(Path::Seq(ms)),
            DblPasting::Diagram(_) => panic!("General pasting not implemented"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::one::fin_category::*;

    #[test]
    fn discrete_dbl_theory() {
        type Hom<V, E> = FinHom<V, E>;

        let mut sgn: FinCategory<char, char> = Default::default();
        sgn.add_ob_generator('*');
        sgn.add_hom_generator('n', '*', '*');
        sgn.set_composite('n', 'n', Hom::Id('*'));

        let thy = DiscreteDblTheory::from(sgn);
        assert!(thy.has_ob_type(&'*'));
        assert!(thy.has_mor_type(&Hom::Generator('n')));
        assert_eq!(thy.basic_ob_types().count(), 1);
        assert_eq!(thy.basic_mor_types().count(), 1);
        let path = Path::pair(Hom::Generator('n'), Hom::Generator('n'));
        assert_eq!(thy.compose_types(path), Hom::Id('*'));
    }
}
