//! Functors between categories.

use std::hash::{BuildHasher, Hash};

use nonempty::NonEmpty;
use ref_cast::RefCast;
use thiserror::Error;

use super::{
    Category, FpCategory, GraphMapping, GraphMorphism, InvalidGraphMorphism, Path, UnderlyingGraph,
};
use crate::zero::{Column, Mapping};

/** A mapping between categories.

Analogous to a [`Mapping`] between sets, this a functor that does not
necessarily have a specified domain or codomain.
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

Such a mapping is determined by where it sends generating objects and morphisms.
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

/** A functor out of a finitely presented (f.p.) category.

The data defining such a functor is a [graph mapping](GraphMapping) from the
f.p. category's generating graph to the codomain category's underlying graph.
The codomain category is arbitrary.

Like a [`Function`](crate::zero::Function), this struct borrows its data. Unlike
a function, the codomain is needed not just for validation but even to evaluate
the functor on morphisms. The domain category is used only for validation.
 */
pub struct FpFunctor<'a, Map, Cod> {
    map: &'a Map,
    cod: &'a Cod,
}

impl<'a, Ob, Mor, Map, Cod> CategoryMap for FpFunctor<'a, Map, Cod>
where
    Ob: Eq + Clone,
    Mor: Eq + Clone,
    Map: GraphMapping<CodV = Ob, CodE = Mor>,
    Cod: Category<Ob = Ob, Mor = Mor>,
{
    type DomOb = Map::DomV;
    type DomMor = Path<Map::DomV, Map::DomE>;
    type CodOb = Ob;
    type CodMor = Mor;
    type ObMap = Map::VertexMap;
    type MorMap = FpFunctorMorMap<'a, Map, Cod>;

    fn ob_map(&self) -> &Self::ObMap {
        self.map.vertex_map()
    }
    fn mor_map(&self) -> &Self::MorMap {
        FpFunctorMorMap::ref_cast(self)
    }
}

impl<'a, Ob, Mor, Map, Cod> FgCategoryMap for FpFunctor<'a, Map, Cod>
where
    Ob: Eq + Clone,
    Mor: Eq + Clone,
    Map: GraphMapping<CodV = Ob, CodE = Mor>,
    Map::VertexMap: Column,
    Map::EdgeMap: Column,
    Cod: Category<Ob = Ob, Mor = Mor>,
{
    type ObGen = Map::DomV;
    type MorGen = Map::DomE;
    type ObGenMap = Map::VertexMap;
    type MorGenMap = Map::EdgeMap;

    fn ob_generator_map(&self) -> &Self::ObGenMap {
        self.map.vertex_map()
    }
    fn mor_generator_map(&self) -> &Self::MorGenMap {
        self.map.edge_map()
    }
}

/// Auxiliary struct for the morphism map of a functor out of an f.p. category.
#[derive(RefCast)]
#[repr(transparent)]
pub struct FpFunctorMorMap<'a, Map, Cod>(FpFunctor<'a, Map, Cod>);

impl<'a, V, E, Ob, Mor, Map, Cod> Mapping for FpFunctorMorMap<'a, Map, Cod>
where
    V: Eq + Clone,
    E: Eq + Clone,
    Mor: Eq + Clone,
    Map: GraphMapping<DomV = V, DomE = E, CodV = Ob, CodE = Mor>,
    Cod: Category<Ob = Ob, Mor = Mor>,
{
    type Dom = Path<V, E>;
    type Cod = Mor;

    fn apply(&self, path: Path<V, E>) -> Option<Mor> {
        path.partial_map(|v| self.0.map.apply_vertex(v), |e| self.0.map.apply_edge(e))
            .map(|path| self.0.cod.compose(path))
    }

    fn is_set(&self, path: &Path<V, E>) -> bool {
        match path {
            Path::Id(v) => self.0.map.is_vertex_assigned(v),
            Path::Seq(edges) => edges.iter().all(|e| self.0.map.is_edge_assigned(e)),
        }
    }
}

impl<'a, Map, Cod> FpFunctor<'a, Map, Cod> {
    /// Constructs a new functor out of an f.p. category.
    pub fn new(map: &'a Map, cod: &'a Cod) -> Self {
        Self { map, cod }
    }
}

impl<'a, V, E, Ob, Mor, Map, Cod> FpFunctor<'a, Map, Cod>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    Ob: Eq + Clone,
    Mor: Eq + Clone,
    Map: GraphMapping<DomV = V, DomE = E, CodV = Ob, CodE = Mor>,
    Cod: Category<Ob = Ob, Mor = Mor>,
{
    /// Validates that the functor is well-defined on the given f.p. category.
    pub fn validate_on<S: BuildHasher>(
        &self,
        dom: &FpCategory<V, E, S>,
    ) -> Result<(), NonEmpty<InvalidFpFunctor<V, E>>> {
        crate::validate::wrap_errors(self.iter_invalid_on(dom))
    }

    /// Iterates over failures to be functorial on the given f.p. category.
    pub fn iter_invalid_on<'b, S: BuildHasher>(
        &'b self,
        dom: &'b FpCategory<V, E, S>,
    ) -> impl Iterator<Item = InvalidFpFunctor<V, E>> + 'b {
        let generator_errors =
            GraphMorphism(self.map, dom.generators(), UnderlyingGraph::ref_cast(self.cod))
                .iter_invalid()
                .map(|err| match err {
                    InvalidGraphMorphism::Vertex(v) => InvalidFpFunctor::ObGen(v),
                    InvalidGraphMorphism::Edge(e) => InvalidFpFunctor::MorGen(e),
                    InvalidGraphMorphism::Src(e) => InvalidFpFunctor::Dom(e),
                    InvalidGraphMorphism::Tgt(e) => InvalidFpFunctor::Cod(e),
                });
        let equation_errors = dom.equations().enumerate().filter_map(|(i, eq)| {
            if let (Some(lhs), Some(rhs)) =
                (self.apply_mor(eq.lhs.clone()), self.apply_mor(eq.rhs.clone()))
                && !self.cod.morphisms_are_equal(lhs, rhs)
            {
                Some(InvalidFpFunctor::Eq(i))
            } else {
                None
            }
        });
        generator_errors.chain(equation_errors)
    }
}

/// A failure of a map out of an f.p. category to be functorial.
#[derive(Debug, Error)]
pub enum InvalidFpFunctor<V, E> {
    /// A generating object not mapped to an object in the codomain category.
    #[error("Object generator `{0}` is not mapped to an object in the codomain")]
    ObGen(V),

    /// A generating morphism not mapped to a morphism in the codomain category.
    #[error("Morphism generator `{0}` is not mapped to a morphism in the codomain")]
    MorGen(E),

    /// A generating morphism whose domain is not preserved.
    #[error("Domain of morphism generator `{0}` is not preserved")]
    Dom(E),

    /// A generating morphism whose codomain is not preserved.
    #[error("Codomain of morphism generator `{0}` is not preserved")]
    Cod(E),

    /// A path equation in domain presentation that is not respected.
    #[error("Path equation `{0}` is not respected")]
    Eq(usize),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::one::{
        ColumnarGraphMapping,
        fp_category::{sch_graph, sch_hgraph, sch_sgraph},
    };
    use crate::zero::HashColumn;
    use ustr::ustr;

    /** Isomorphism b/w the schemas for half-edge graphs and symmetric graphs.

    Reference: https://blog.algebraicjulia.org/post/2020/09/cset-graphs-2/
     */
    #[test]
    fn sch_sgraph_to_hgraph() {
        let (sch_hgraph, sch_sgraph) = (sch_hgraph(), sch_sgraph());
        let ob_map = HashColumn::new([(ustr("V"), ustr("V")), (ustr("E"), ustr("H"))].into());
        let mor_map = HashColumn::new(
            [
                (ustr("src"), Path::single(ustr("vert"))),
                (ustr("tgt"), Path::pair(ustr("inv"), ustr("vert"))),
                (ustr("inv"), Path::single(ustr("inv"))),
            ]
            .into(),
        );
        let map = ColumnarGraphMapping::new(ob_map, mor_map);
        let functor = FpFunctor::new(&map, &sch_hgraph);
        assert!(functor.validate_on(&sch_sgraph).is_ok());
    }

    /// Non-functor from schema for symmetric graphs to schema for graphs.
    #[test]
    fn sch_sgraph_to_graph() {
        let (sch_graph, sch_sgraph) = (sch_graph(), sch_sgraph());
        let ob_map = HashColumn::new([(ustr("V"), ustr("V")), (ustr("E"), ustr("E"))].into());
        let mor_map = HashColumn::new(
            [
                (ustr("src"), Path::single(ustr("src"))),
                (ustr("tgt"), Path::single(ustr("tgt"))),
                (ustr("inv"), Path::empty(ustr("E"))),
            ]
            .into(),
        );
        let map = ColumnarGraphMapping::new(ob_map, mor_map);
        let functor = FpFunctor::new(&map, &sch_graph);
        // Two equations fail, namely that `inv` swaps `src` and `tgt`.
        assert_eq!(functor.validate_on(&sch_sgraph).map_err(|errs| errs.len()), Err(2));
    }
}
