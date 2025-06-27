//! Functors between categories.

use crate::zero::{Column, Mapping};

/** A mapping between categories.

Analogous to a [`Mapping`] between sets, this a functor that does not yet know
its domain or codomain.
 */
pub trait CategoryMap {
    /// Type of objects in domain category.
    type DomOb: Eq + Clone;

    /// Type of morphisms in domain category.
    type DomMor: Eq + Clone;

    /// Type of objects in codomain category.
    type CodOb: Eq + Clone;

    /// Type of morphisms in codomain category.
    type CodMor: Eq + Clone;

    /// Type of underlying mapping on objects.
    type ObMap: Mapping<Dom = Self::DomOb, Cod = Self::CodOb>;

    /// Type of underlying mapping on morphisms.
    type MorMap: Mapping<Dom = Self::DomMor, Cod = Self::CodMor>;

    /// Gets the underlying mapping on objects.
    fn ob_map(&self) -> &Self::ObMap;

    /// Gets the underlying mapping on morphisms.
    fn mor_map(&self) -> &Self::MorMap;

    /// Applies the mapping to an object.
    fn apply_ob(&self, x: Self::DomOb) -> Option<Self::CodOb> {
        self.ob_map().apply(x)
    }

    /// Applies the mapping to a morphism.
    fn apply_mor(&self, m: Self::DomMor) -> Option<Self::CodMor> {
        self.mor_map().apply(m)
    }

    /// Is the mapping defined at an object?
    fn is_ob_assigned(&self, x: &Self::DomOb) -> bool {
        self.ob_map().is_set(x)
    }

    /// Is the mapping defined at a morphism?
    fn is_mor_assigned(&self, m: &Self::DomMor) -> bool {
        self.mor_map().is_set(m)
    }
}

/** A mapping out of a finitely generated category.

Such a mapping is determined by its action on generating objects and morphisms.
The codomain category is arbitrary.
 */
pub trait FgCategoryMap: CategoryMap {
    /// Type of object generators in domain category.
    type ObGen: Eq + Clone;

    /// Type of morphism generators in domain category.
    type MorGen: Eq + Clone;

    /// Type of underlying mapping from object generators to objects.
    type ObGenMap: Column<Dom = Self::ObGen, Cod = Self::CodOb>;

    /// Type of underlying mapping from morphism generators to morphisms.
    type MorGenMap: Column<Dom = Self::MorGen, Cod = Self::CodMor>;

    /// Gets the underlying mapping from object generators to objects.
    fn ob_generator_map(&self) -> &Self::ObGenMap;

    /// Gets the underlying mapping from morphism generators to morphisms.
    fn mor_generator_map(&self) -> &Self::MorGenMap;

    /// Applies the mapping at a generating object.
    fn apply_ob_generator(&self, x: Self::ObGen) -> Option<Self::CodOb> {
        self.ob_generator_map().apply(x)
    }

    /// Applies the mapping at a generating morphism.
    fn apply_mor_generator(&self, m: Self::MorGen) -> Option<Self::CodMor> {
        self.mor_generator_map().apply(m)
    }
}

/** A functor defined by a [category mapping](CategoryMap).

Analogous to a [`Function`](crate::zero::Function) between sets, this struct
exists to validate that a mapping between categories defines a valid functor.
 */
pub struct Functor<'a, Map, Dom, Cod>(pub &'a Map, pub &'a Dom, pub &'a Cod);
