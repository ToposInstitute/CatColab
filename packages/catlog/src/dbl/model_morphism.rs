/*! Morphisms between models of double theories.

A morphism between [models](super::model) consists of functions between objects
and between morphisms that are:

1. *Well-typed*: preserve object and morphism types
2. *Functorial*: preserve composition and identities
3. *Natural*: commute with object operations and morphism operations, possibly up
   to comparison maps

In mathematical terms, a model morphism is a natural transformation between lax
double functors. The natural transformation can be strict, pseudo, lax, or
oplax.

# References

- [Lambert & Patterson 2024](crate::refs::CartDblTheories),
  Section 7: Lax transformations
 */

use std::hash::Hash;

use derivative::Derivative;

use crate::one::graph_algorithms::{spec_order, GraphElem};
use crate::one::*;
use crate::zero::{HashColumn, Mapping};

use super::model::{DblModel, DiscreteDblModel};

/** A mapping between models of a double theory.

Analogous to a mapping between [sets](crate::zero::Mapping) or
[graphs](crate::one::GraphMapping), a model mapping is a morphism between models
of a double theory without specified domain or codomain models.
 */
pub trait DblModelMapping {
    /// Type of objects in the domain model.
    type DomOb: Eq;

    /// Type of morphisms in the domain model.
    type DomMor: Eq;

    /// Type of objects in the codomain model.
    type CodOb: Eq;

    /// Type of morphisms in the codomain model.
    type CodMor: Eq;

    /// Applies the mapping to an object in the domain model.
    fn apply_ob(&self, x: &Self::DomOb) -> Option<Self::CodOb>;

    /// Applies the mapping to a morphism in the domain model.
    fn apply_mor(&self, m: &Self::DomMor) -> Option<Self::CodMor>;

    /// Is the mapping defined at an object?
    fn is_ob_assigned(&self, x: &Self::DomOb) -> bool {
        self.apply_ob(x).is_some()
    }

    /// Is the mapping defined at a morphism?
    fn is_mor_assigned(&self, m: &Self::DomMor) -> bool {
        self.apply_mor(m).is_some()
    }
}

/** A mapping between models of a discrete double theory.

Because a discrete double theory has only trivial operations, the naturality
axioms for a model morphism also become trivial.
 */
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
pub struct DiscreteDblModelMapping<DomId, CodId> {
    ob_map: HashColumn<DomId, CodId>,
    mor_map: HashColumn<DomId, Path<CodId, CodId>>,
}

impl<DomId, CodId> DiscreteDblModelMapping<DomId, CodId>
where
    DomId: Clone + Eq + Hash,
    CodId: Clone + Eq + Hash,
{
    /// Applies the mapping at a basic morphism in the domain model.
    pub fn apply_basic_mor(&self, e: &DomId) -> Option<Path<CodId, CodId>> {
        self.mor_map.apply(e).cloned()
    }

    /// Is the mapping defined at a basic morphism?
    pub fn is_basic_mor_assigned(&self, e: &DomId) -> bool {
        self.mor_map.is_set(e)
    }

    /// Assigns the mapping at an object, returning the previous assignment.
    pub fn assign_ob(&mut self, x: DomId, y: CodId) -> Option<CodId> {
        self.ob_map.set(x, y)
    }

    /// Assigns the mapping at a basic morphism, returning the previous assignment.
    pub fn assign_basic_mor(
        &mut self,
        e: DomId,
        n: Path<CodId, CodId>,
    ) -> Option<Path<CodId, CodId>> {
        self.mor_map.set(e, n)
    }

    /// Unassigns the mapping at an object, returning the previous assignment.
    pub fn unassign_ob(&mut self, x: &DomId) -> Option<CodId> {
        self.ob_map.unset(x)
    }

    /// Unassigns the mapping a basic morphism, returning the previous assignment.
    pub fn unassign_basic_mor(&mut self, e: &DomId) -> Option<Path<CodId, CodId>> {
        self.mor_map.unset(e)
    }

    /// Returns all morphisms between two models of a discrete double theory.
    pub fn morphisms<Cat>(
        dom: &DiscreteDblModel<DomId, Cat>,
        cod: &DiscreteDblModel<CodId, Cat>,
    ) -> Vec<Self>
    where
        Cat: FgCategory,
        Cat::Ob: Eq + Clone + Hash,
        Cat::Hom: Eq + Clone + Hash,
    {
        let mut search = BacktrackingSearch::new(dom, cod);
        search.find_all()
    }
}

impl<DomId, CodId> DblModelMapping for DiscreteDblModelMapping<DomId, CodId>
where
    DomId: Clone + Eq + Hash,
    CodId: Clone + Eq + Hash,
{
    type DomOb = DomId;
    type DomMor = Path<DomId, DomId>;
    type CodOb = CodId;
    type CodMor = Path<CodId, CodId>;

    fn apply_ob(&self, x: &Self::DomOb) -> Option<Self::CodOb> {
        self.ob_map.apply(x).cloned()
    }

    fn apply_mor(&self, m: &Self::DomMor) -> Option<Self::CodMor> {
        m.clone()
            .partial_map(|x| self.apply_ob(&x), |e| self.apply_basic_mor(&e))
            .map(|path| path.flatten())
    }

    fn is_ob_assigned(&self, x: &Self::DomOb) -> bool {
        self.ob_map.is_set(x)
    }

    fn is_mor_assigned(&self, m: &Self::DomMor) -> bool {
        match m {
            Path::Id(x) => self.is_ob_assigned(x),
            Path::Seq(edges) => edges.iter().all(|e| self.is_basic_mor_assigned(e)),
        }
    }
}

struct BacktrackingSearch<'a, DomId, CodId, Cat: FgCategory> {
    dom: &'a DiscreteDblModel<DomId, Cat>,
    cod: &'a DiscreteDblModel<CodId, Cat>,
    map: DiscreteDblModelMapping<DomId, CodId>,
    results: Vec<DiscreteDblModelMapping<DomId, CodId>>,
    var_order: Vec<GraphElem<DomId, DomId>>,
}

impl<'a, DomId, CodId, Cat> BacktrackingSearch<'a, DomId, CodId, Cat>
where
    DomId: Clone + Eq + Hash,
    CodId: Clone + Eq + Hash,
    Cat: FgCategory,
    Cat::Ob: Eq + Clone + Hash,
    Cat::Hom: Eq + Clone + Hash,
{
    fn new(dom: &'a DiscreteDblModel<DomId, Cat>, cod: &'a DiscreteDblModel<CodId, Cat>) -> Self {
        // Compute a search ordering for the variables of the CSP, which are the
        // elements of the domain graph. Prioritize vertices with high degree
        // since they will more constrained. This is a version of the well known
        // "most constrained variable" heuristic in CSP.
        let dom_graph = dom.generating_graph();
        let mut vertices: Vec<_> = dom_graph.vertices().collect();
        vertices.sort_by_key(|v| std::cmp::Reverse(dom_graph.degree(v)));
        let var_order = spec_order(dom_graph, vertices.into_iter());

        Self {
            dom,
            cod,
            map: Default::default(),
            results: Default::default(),
            var_order,
        }
    }

    fn find_all(&mut self) -> Vec<DiscreteDblModelMapping<DomId, CodId>> {
        self.search(0);
        std::mem::take(&mut self.results)
    }

    fn search(&mut self, depth: usize) {
        if depth >= self.var_order.len() {
            self.results.push(self.map.clone());
            return;
        }
        let var = &self.var_order[depth];
        match var.clone() {
            GraphElem::Vertex(x) => {
                for y in self.cod.objects_with_type(&self.dom.ob_type(&x)) {
                    self.map.assign_ob(x.clone(), y);
                    self.search(depth + 1);
                }
            }
            GraphElem::Edge(m) => {
                let path = Path::single(m);
                let _w = self
                    .map
                    .apply_ob(&self.dom.dom(&path))
                    .expect("Domain has already been assigned");
                let _z = self
                    .map
                    .apply_ob(&self.dom.cod(&path))
                    .expect("Codomain has already been assigned");
                let _m = path.only();
                // TODO: Iterate over all paths.
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discrete_dbl_model_mapping() {
        let mut f: DiscreteDblModelMapping<_, _> = Default::default();
        f.assign_ob('a', 'x');
        f.assign_ob('b', 'y');
        assert!(f.is_ob_assigned(&'a'));
        assert_eq!(f.apply_ob(&'b'), Some('y'));
        f.assign_basic_mor('f', Path::pair('p', 'q'));
        f.assign_basic_mor('g', Path::pair('r', 's'));
        assert!(f.is_mor_assigned(&Path::single('f')));
        assert_eq!(f.apply_mor(&Path::pair('f', 'g')), Path::from_vec(vec!['p', 'q', 'r', 's']));
    }
}
