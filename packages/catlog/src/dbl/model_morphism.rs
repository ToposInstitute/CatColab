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

use std::collections::HashSet;
use std::hash::Hash;
use std::sync::Arc;

use derivative::Derivative;

use nonempty::NonEmpty;
use thiserror::Error;

use crate::one::graph_algorithms::{simple_paths, spec_order};
use crate::one::*;
use crate::validate::{self, Validate};
use crate::zero::{Column, HashColumn, Mapping};

use super::model::{DblModel, DiscreteDblModel, FgDblModel};

/** A mapping between models of a double theory.

Analogous to a mapping between [sets](crate::zero::Mapping) or
[graphs](crate::one::GraphMapping), a model mapping is a morphism between models
of a double theory without specified domain or codomain models.
 */
pub trait DblModelMapping {
    /// Type of objects in the domain model.
    type DomOb: Eq + Clone;

    /// Type of morphisms in the domain model.
    type DomMor: Eq + Clone;

    /// Type of objects in the codomain model.
    type CodOb: Eq + Clone;

    /// Type of morphisms in the codomain model.
    type CodMor: Eq + Clone;

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
#[derive(Clone, Debug, Derivative)]
#[derivative(Default(bound = ""))]
#[derivative(PartialEq(bound = "DomId: Eq + Hash, CodId: PartialEq"))]
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

    /** Basic objects and morphisms in the image of the model morphism.

    Note this method does not compute the set-theoretic image of the model
    morphism, as the image of a functor need not even form a category
    ([Math.SE](https://math.stackexchange.com/a/4399114)), nor does it compute
    submodel spanned by the image, generalizing the subcategory spanned by the
    image of a functor. Instead, this method constructs a "syntactical image"
    comprising all *basic* objects and morphisms appearing in the image of the
    model morphism, possibly inside composites.
     */
    pub fn syntactic_image<Cat>(
        &self,
        cod: &DiscreteDblModel<CodId, Cat>,
    ) -> DiscreteDblModel<CodId, Cat>
    where
        Cat: FgCategory,
        Cat::Ob: Hash,
        Cat::Mor: Hash,
    {
        // TODO: For non-free models, we should filter the equations to those
        // involving only generators that appear in the image.
        assert!(cod.is_free(), "Codomain model should be free");

        let mut im = DiscreteDblModel::new(cod.theory_arc());
        for x in self.ob_map.values() {
            im.add_ob(x.clone(), cod.ob_type(x));
        }
        for path in self.mor_map.values() {
            for e in path.iter() {
                let p = Path::single(e.clone());
                let (x, y) = (cod.dom(&p), cod.cod(&p));
                im.add_ob(x.clone(), cod.ob_type(&x));
                im.add_ob(y.clone(), cod.ob_type(&y));
                im.add_mor(e.clone(), x, y, cod.mor_type(&p));
            }
        }
        im
    }

    /// Finder of morphisms between two models of a discrete double theory.
    pub fn morphisms<'a, Cat>(
        dom: &'a DiscreteDblModel<DomId, Cat>,
        cod: &'a DiscreteDblModel<CodId, Cat>,
    ) -> DiscreteDblModelMorphismFinder<'a, DomId, CodId, Cat>
    where
        Cat: FgCategory,
        Cat::Ob: Hash,
        Cat::Mor: Hash,
    {
        DiscreteDblModelMorphismFinder::new(dom, cod)
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

/** A functor between models of a double theory defined by a [mapping](DblModelMapping).

This struct borrows its data to perform validation. The domain and codomain are
assumed to be valid models of double theories. If that is in question, the
models should be validated *before* validating this object.
 */
pub struct DblModelMorphism<'a, Map, Dom, Cod>(pub &'a Map, pub &'a Dom, pub &'a Cod);

/// A morphism between models of a discrete double theory.
pub type DiscreteDblModelMorphism<'a, DomId, CodId, Cat> = DblModelMorphism<
    'a,
    DiscreteDblModelMapping<DomId, CodId>,
    DiscreteDblModel<DomId, Cat>,
    DiscreteDblModel<CodId, Cat>,
>;

impl<'a, DomId, CodId, Cat> DiscreteDblModelMorphism<'a, DomId, CodId, Cat>
where
    DomId: Eq + Clone + Hash,
    CodId: Eq + Clone + Hash,
    Cat: FgCategory,
    Cat::Ob: Hash,
    Cat::Mor: Hash,
{
    /// Iterates over failures of the mapping to be a model morphism.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidDblModelMorphism<DomId, DomId>> + 'a {
        let DblModelMorphism(mapping, dom, cod) = *self;
        // TODO: We don't yet have the ability to solve word problems.
        // Equations in the domain induce equations to check in the codomain.
        assert!(dom.is_free(), "Domain model should be free");

        let ob_errors = dom.object_generators().filter_map(|v| {
            if let Some(f_v) = mapping.apply_ob(&v) {
                if !cod.has_ob(&f_v) {
                    Some(InvalidDblModelMorphism::Ob(v))
                } else if dom.ob_type(&v) != cod.ob_type(&f_v) {
                    Some(InvalidDblModelMorphism::ObType(v))
                } else {
                    None
                }
            } else {
                Some(InvalidDblModelMorphism::MissingOb(v))
            }
        });

        let mor_errors = dom.morphism_generators().flat_map(|f| {
            if let Some(f_f) = mapping.apply_basic_mor(&f) {
                if !cod.has_mor(&f_f) {
                    [InvalidDblModelMorphism::Mor(f)].to_vec()
                } else {
                    let dom_f = mapping.apply_ob(&dom.morphism_generator_dom(&f));
                    let cod_f = mapping.apply_ob(&dom.morphism_generator_cod(&f));
                    let f_type = dom.mor_gen_type(&f);
                    let ff_type = cod.mor_type(&f_f);

                    let mut errs = vec![];
                    if Some(cod.dom(&f_f)) != dom_f {
                        errs.push(InvalidDblModelMorphism::Dom(f.clone()));
                    }
                    if Some(cod.cod(&f_f)) != cod_f {
                        errs.push(InvalidDblModelMorphism::Cod(f.clone()));
                    }
                    if f_type != ff_type {
                        errs.push(InvalidDblModelMorphism::MorType(f));
                    }
                    errs
                }
            } else {
                [InvalidDblModelMorphism::MissingMor(f)].to_vec()
            }
        });
        ob_errors.chain(mor_errors)
    }

    /// Are morphism generators sent to simple composites of morphisms in the
    /// codomain?
    fn is_simple(&self) -> bool {
        let DblModelMorphism(mapping, dom, _) = *self;
        dom.morphism_generators()
            .all(|e| mapping.apply_basic_mor(&e).map(|p| p.is_simple()).unwrap_or(true))
    }

    /// Is the model morphism injective on objects?
    pub fn is_injective_objects(&self) -> bool {
        let DblModelMorphism(mapping, dom, _) = *self;
        let mut seen_obs: HashSet<_> = HashSet::new();
        for x in dom.object_generators() {
            if let Some(f_x) = mapping.apply_ob(&x) {
                if seen_obs.contains(&f_x) {
                    return false; // not monic
                } else {
                    seen_obs.insert(f_x);
                }
            }
        }
        true
    }

    /** Is the model morphism faithful?

    This check is a nontrivial computation since we cannot enumerate all of the
    morphisms of the domain category. We simplify the problem by only allowing
    free models. Furthermore, we restrict the mapping to send generating
    morphisms in the domain to simple paths in the codomain. If any of these
    assumptions are violated, the function will panic.
     */
    pub fn is_free_simple_faithful(&self) -> bool {
        let DblModelMorphism(mapping, dom, cod) = *self;

        assert!(dom.is_free(), "Domain model should be free");
        assert!(cod.is_free(), "Codomain model should be free");
        assert!(&self.is_simple(), "Morphism assignments should be simple");

        for x in dom.object_generators() {
            for y in dom.object_generators() {
                let mut seen: HashSet<_> = HashSet::new();
                for path in simple_paths(dom.generating_graph(), &x, &y) {
                    if let Some(f_path) = mapping.apply_mor(&path) {
                        if seen.contains(&f_path) {
                            return false; // not faithful
                        } else {
                            seen.insert(f_path);
                        }
                    }
                }
            }
        }
        true
    }

    /** Is the model morphism a monomorphism?

    A monomorphism in Cat is an injective on objects and faithful functor. Thus,
    we check injectivity on objects and faithfulness. Note that the latter check
    is subject to the same limitations as
    [`is_free_simple_faithful`](DblModelMorphism::is_free_simple_faithful).
     */
    pub fn is_free_simple_monic(&self) -> bool {
        self.is_injective_objects() && self.is_free_simple_faithful()
    }
}

impl<DomId, CodId, Cat> Validate for DiscreteDblModelMorphism<'_, DomId, CodId, Cat>
where
    DomId: Eq + Clone + Hash,
    CodId: Eq + Clone + Hash,
    Cat: FgCategory,
    Cat::Ob: Hash,
    Cat::Mor: Hash,
{
    type ValidationError = InvalidDblModelMorphism<DomId, DomId>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

/** An invalid assignment in a double model morphism defined explicitly by data.
 *
 * Note that, by specifying a model morphism via its action on generators, we
 * obtain for free that identities are sent to identities and composites of
 * generators are sent to their composites in the codomain.
*/
#[derive(Debug, Error, PartialEq, Clone)]
pub enum InvalidDblModelMorphism<Ob, Mor> {
    /// Invalid data
    #[error("Object `{0}` is mapped to an object not in the codomain")]
    Ob(Ob),

    /// Invalid data
    #[error("Morphism `{0}` is mapped to a morphism not in the codomain")]
    Mor(Mor),

    /// Missing data
    #[error("Object `{0}` is not mapped to an anything in the codomain")]
    MissingOb(Ob),

    /// Missing data
    #[error("Morphism `{0}` is not mapped to anything in the codomain")]
    MissingMor(Mor),

    /// Type error
    #[error("Object `{0}` is not mapped to an object of the same type in the codomain")]
    ObType(Ob),

    /// Type error
    #[error("Morphism `{0}` is not mapped to a morphism of the same type in the codomain")]
    MorType(Mor),

    /// A morphism in the domain does not have dom preserved in codomain.
    #[error("Morphism `{0}` domain not preserved in the codomain")]
    Dom(Mor),

    /// A morphism in the domain does not have codom preserved in codomain
    #[error("Morphism `{0}` codomain not preserved in the codomain")]
    Cod(Mor),
}

/** Finds morphisms between two models of a discrete double theory.

Morphisms are found using backtracking search. In general, there can be
infinitely many morphisms between two models, so not all of them can be
reported. The search is restricted to morphisms that send each basic morphism in
the domain to a [simple path](crate::one::graph_algorithms::simple_paths) of
basic morphisms in the codomain.
*/
pub struct DiscreteDblModelMorphismFinder<'a, DomId, CodId, Cat: FgCategory> {
    dom: &'a DiscreteDblModel<DomId, Cat>,
    cod: &'a DiscreteDblModel<CodId, Cat>,
    map: DiscreteDblModelMapping<DomId, CodId>,
    results: Vec<DiscreteDblModelMapping<DomId, CodId>>,
    var_order: Vec<GraphElem<DomId, DomId>>,
    injective_ob: bool,
    faithful: bool,
    ob_init: HashColumn<DomId, CodId>,
    mor_init: HashColumn<DomId, Path<CodId, CodId>>,
    ob_inv: HashColumn<CodId, DomId>,
}

impl<'a, DomId, CodId, Cat> DiscreteDblModelMorphismFinder<'a, DomId, CodId, Cat>
where
    DomId: Clone + Eq + Hash,
    CodId: Clone + Eq + Hash,
    Cat: FgCategory,
    Cat::Ob: Hash,
    Cat::Mor: Hash,
{
    fn new(dom: &'a DiscreteDblModel<DomId, Cat>, cod: &'a DiscreteDblModel<CodId, Cat>) -> Self {
        assert!(
            Arc::ptr_eq(&dom.theory_arc(), &cod.theory_arc()),
            "Domain and codomain model should have the same theory"
        );
        assert!(dom.is_free(), "Domain model should be free");

        // Order the variables of the CSP, which are the elements of the domain
        // graph. Prefer vertices with high degree since they are more
        // constrained. This is a version of the well known "most constrained
        // variable" heuristic in CSP.
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
            injective_ob: false,
            faithful: false,
            ob_init: HashColumn::default(),
            mor_init: HashColumn::default(),
            ob_inv: HashColumn::default(),
        }
    }

    /// Restrict the search to monomorphisms between models.
    pub fn monic(&mut self) -> &mut Self {
        self.injective_ob = true;
        self.faithful = true;
        self
    }

    /// Restrict the search to model morphisms that are injective on objects.
    pub fn injective_ob(&mut self) -> &mut Self {
        self.injective_ob = true;
        self
    }

    /** Restrict the search to model morphisms that are faithful.

    A faithful morphism is an injective map on morphisms when restricted to any
    domain/codomain pair of objects in the domain.

    In future work, this will be efficiently checked for early search tree
    pruning; however, this is currently enforced by filtering with
    [is_free_simple_faithful](DiscreteDblModelMorphism::is_free_simple_faithful).
     */
    pub fn faithful(&mut self) -> &mut Self {
        self.faithful = true;
        self
    }

    /// Require morphisms to send object `ob` in domain to `val` in codomain.
    pub fn initialize_ob(&mut self, ob: DomId, val: CodId) -> &mut Self {
        self.ob_init.set(ob, val);
        self
    }

    /// Require morphisms to send morphism `m` in domain to `val` in codomain.
    pub fn initialize_mor(&mut self, m: DomId, val: Path<CodId, CodId>) -> &mut Self {
        self.mor_init.set(m, val);
        self
    }

    /// Finds all morphisms.
    pub fn find_all(&mut self) -> Vec<DiscreteDblModelMapping<DomId, CodId>> {
        self.search(0);
        std::mem::take(&mut self.results)
    }

    fn search(&mut self, depth: usize) {
        if depth >= self.var_order.len() {
            if !self.faithful
                || DblModelMorphism(&self.map, self.dom, self.cod).is_free_simple_faithful()
            {
                self.results.push(self.map.clone());
            }
            return;
        }
        let var = &self.var_order[depth];
        match var.clone() {
            GraphElem::Vertex(x) => {
                if self.ob_init.is_set(&x) {
                    let y = self.ob_init.apply(&x).cloned().unwrap();
                    let can_assign = self.assign_ob(x.clone(), y.clone());
                    if can_assign {
                        self.search(depth + 1);
                        self.unassign_ob(x, y)
                    }
                } else {
                    for y in self.cod.object_generators_with_type(&self.dom.ob_type(&x)) {
                        let can_assign = self.assign_ob(x.clone(), y.clone());
                        if can_assign {
                            self.search(depth + 1);
                            self.unassign_ob(x.clone(), y)
                        }
                    }
                }
            }
            GraphElem::Edge(m) => {
                if self.mor_init.is_set(&m) {
                    let path = self.mor_init.apply(&m).cloned().unwrap();
                    self.map.assign_basic_mor(m, path);
                    self.search(depth + 1);
                } else {
                    let path = Path::single(m);
                    let mor_type = self.dom.mor_type(&path);
                    let w = self
                        .map
                        .apply_ob(&self.dom.dom(&path))
                        .expect("Domain has already been assigned");
                    let z = self
                        .map
                        .apply_ob(&self.dom.cod(&path))
                        .expect("Codomain has already been assigned");
                    let m = path.only().unwrap();

                    let cod_graph = self.cod.generating_graph();
                    for path in simple_paths(cod_graph, &w, &z) {
                        if self.cod.mor_type(&path) == mor_type
                            && !(self.faithful && path.is_empty())
                        {
                            self.map.assign_basic_mor(m.clone(), path);
                            self.search(depth + 1);
                        }
                    }
                }
            }
        }
    }

    /// Attempt an object assignment, returning true iff successful.
    fn assign_ob(&mut self, x: DomId, y: CodId) -> bool {
        if self.injective_ob {
            if let Some(y_inv) = self.ob_inv.apply(&y) {
                if *y_inv != x {
                    return false;
                }
            }
        }
        self.map.assign_ob(x.clone(), y.clone());
        self.ob_inv.set(y, x);
        true
    }

    /// Undo an object assignment.
    fn unassign_ob(&mut self, _: DomId, y: CodId) {
        self.ob_inv.unset(&y);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::dbl::model::UstrDiscreteDblModel;
    use crate::one::fin_category::FinMor;
    use crate::stdlib::*;
    use crate::validate::Validate;

    use std::collections::HashMap;
    use ustr::ustr;

    #[test]
    fn discrete_model_mapping() {
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

    #[test]
    fn find_positive_loops() {
        let th = Arc::new(th_signed_category());
        let positive_loop = positive_loop(th.clone());
        let pos = positive_loop.morphism_generators().next().unwrap().into();

        let maps = DiscreteDblModelMapping::morphisms(&positive_loop, &positive_loop).find_all();
        assert_eq!(maps.len(), 2);
        let mors: Vec<_> = maps.into_iter().map(|mor| mor.apply_mor(&pos)).collect();
        assert!(mors.iter().any(|mor| matches!(mor, Some(Path::Id(_)))));
        assert!(mors.iter().any(|mor| matches!(mor, Some(Path::Seq(_)))));

        let maps = DiscreteDblModelMapping::morphisms(&positive_loop, &positive_loop)
            .monic()
            .find_all();
        assert_eq!(maps.len(), 1);
        assert!(matches!(maps[0].apply_mor(&pos), Some(Path::Seq(_))));
    }

    /// The [simple path](crate::one::graph_algorithms::simple_paths) should
    /// give identical results to hom search from a walking morphism (assuming
    /// all the object/morphism types are the same).   
    #[test]
    fn find_simple_paths() {
        let th = Arc::new(th_signed_category());

        let mut walking = UstrDiscreteDblModel::new(th.clone());
        let (a, b) = (ustr("A"), ustr("B"));
        walking.add_ob(a, ustr("Object"));
        walking.add_ob(b, ustr("Object"));
        walking.add_mor(ustr("f"), a, b, FinMor::Id(ustr("Object")));
        let w = Path::single(ustr("f"));

        //     y         Graph with lots of cyclic paths.
        //   ↗  ↘
        // ↻x ⇆ z
        let mut model = UstrDiscreteDblModel::new(th);
        let (x, y, z) = (ustr("X"), ustr("Y"), ustr("Z"));
        model.add_ob(x, ustr("Object"));
        model.add_ob(y, ustr("Object"));
        model.add_ob(z, ustr("Object"));
        model.add_mor(ustr("xy"), x, y, FinMor::Id(ustr("Object")));
        model.add_mor(ustr("yz"), y, z, FinMor::Id(ustr("Object")));
        model.add_mor(ustr("zx"), z, x, FinMor::Id(ustr("Object")));
        model.add_mor(ustr("xz"), x, z, FinMor::Id(ustr("Object")));
        model.add_mor(ustr("xx"), x, x, FinMor::Id(ustr("Object")));

        for i in model.object_generators() {
            for j in model.object_generators() {
                let maps: HashSet<_> = DiscreteDblModelMapping::morphisms(&walking, &model)
                    .initialize_ob(ustr("A"), i)
                    .initialize_ob(ustr("B"), j)
                    .find_all()
                    .into_iter()
                    .map(|f| f.apply_mor(&w).unwrap())
                    .collect();
                let spaths: HashSet<_> = simple_paths(model.generating_graph(), &i, &j).collect();
                assert_eq!(maps, spaths);
            }
        }
    }

    #[test]
    fn find_negative_loops() {
        let th = Arc::new(th_signed_category());
        let negative_loop = negative_loop(th.clone());
        let base_pt = negative_loop.object_generators().next().unwrap();

        let negative_feedback = negative_feedback(th);
        let maps =
            DiscreteDblModelMapping::morphisms(&negative_loop, &negative_feedback).find_all();
        assert_eq!(maps.len(), 2);
        let obs: Vec<_> = maps.iter().map(|mor| mor.apply_ob(&base_pt)).collect();
        assert!(obs.contains(&Some(ustr("x"))));
        assert!(obs.contains(&Some(ustr("y"))));

        let im = maps[0].syntactic_image(&negative_feedback);
        assert!(im.validate().is_ok());
        assert!(im.has_mor(&Path::single(ustr("positive"))));
        assert!(im.has_mor(&Path::single(ustr("negative"))));
    }

    #[test]
    fn validate_model_morphism() {
        let theory = Arc::new(th_signed_category());
        let negloop = negative_loop(theory.clone());
        let posfeed = positive_feedback(theory.clone());

        let f = DiscreteDblModelMapping {
            ob_map: HashMap::from([(ustr("x"), ustr("x"))]).into(),
            mor_map: HashMap::from([(ustr(""), Path::Id(ustr("negative")))]).into(),
        };
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        assert!(dmm.validate().is_err());

        // A bad map from h to itself that is wrong for the ob (it is in the map
        // but sent to something that doesn't exist) and for the hom generator
        // (not in the map)
        let f = DiscreteDblModelMapping {
            ob_map: HashMap::from([(ustr("x"), ustr("y"))]).into(),
            mor_map: HashMap::from([(ustr("y"), Path::Id(ustr("y")))]).into(),
        };
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        let errs: Vec<_> = dmm.validate().expect_err("should be invalid").into();
        assert!(
            errs == vec![
                InvalidDblModelMorphism::Ob(ustr("x")),
                InvalidDblModelMorphism::MissingMor(ustr("negative")),
            ]
        );

        // A bad map that doesn't preserve dom
        let f = DiscreteDblModelMapping {
            ob_map: HashMap::from([(ustr("x"), ustr("x"))]).into(),
            mor_map: HashMap::from([(ustr("negative"), Path::single(ustr("positive1")))]).into(),
        };
        let dmm = DblModelMorphism(&f, &negloop, &posfeed);
        let errs: Vec<_> = dmm.validate().expect_err("should be invalid").into();
        assert!(
            errs == vec![
                InvalidDblModelMorphism::Cod(ustr("negative")),
                InvalidDblModelMorphism::MorType(ustr("negative")),
            ]
        );

        // A bad map that doesn't preserve codom
        let f = DiscreteDblModelMapping {
            ob_map: HashMap::from([(ustr("x"), ustr("x"))]).into(),
            mor_map: HashMap::from([(ustr("negative"), Path::single(ustr("positive2")))]).into(),
        };
        let dmm = DblModelMorphism(&f, &negloop, &posfeed);
        let errs: Vec<_> = dmm.validate().expect_err("should be invalid").into();
        assert!(
            errs == vec![
                InvalidDblModelMorphism::Dom(ustr("negative")),
                InvalidDblModelMorphism::MorType(ustr("negative")),
            ]
        );
    }

    #[test]
    fn validate_is_free_simple_monic() {
        let theory = Arc::new(th_signed_category());
        let negloop = positive_loop(theory.clone());

        // Identity map
        let f = DiscreteDblModelMapping {
            ob_map: HashMap::from([(ustr("x"), ustr("x"))]).into(),
            mor_map: HashMap::from([(ustr("positive"), Path::single(ustr("positive")))]).into(),
        };
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        assert!(dmm.validate().is_ok());
        assert!(dmm.is_free_simple_monic());

        // Send generator to identity
        let f = DiscreteDblModelMapping {
            ob_map: HashMap::from([(ustr("x"), ustr("x"))]).into(),
            mor_map: HashMap::from([(ustr("positive"), Path::Id(ustr("x")))]).into(),
        };
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        assert!(dmm.validate().is_ok());
        assert!(!dmm.is_free_simple_monic());
    }

    #[test]
    fn monic_constraint() {
        // The number of endomonomorphisms of a set |N| is N!.
        let theory = Arc::new(th_signed_category());
        let mut model = UstrDiscreteDblModel::new(theory.clone());
        let (q, x, y, z) = (ustr("Q"), ustr("X"), ustr("Y"), ustr("Z"));
        let ob = ustr("Object");
        model.add_ob(q, ob);
        model.add_ob(x, ob);
        model.add_ob(y, ob);
        model.add_ob(z, ob);
        assert_eq!(
            DiscreteDblModelMapping::morphisms(&model, &model)
                .monic()
                .find_all()
                .into_iter()
                .len(),
            4 * 3 * 2
        );

        // Hom from noncommuting triangle into a pair of triangles, only one one
        // of which commutes. There is only one morphism that is faithful.
        let (f, g, h, i, j) = (ustr("f"), ustr("g"), ustr("h"), ustr("i"), ustr("j"));
        let mut freetri = UstrDiscreteDblModel::new(theory.clone());
        freetri.add_ob(x, ob);
        freetri.add_ob(y, ob);
        freetri.add_ob(z, ob);
        freetri.add_mor(f, x, y, FinMor::Id(ob));
        freetri.add_mor(g, y, z, FinMor::Id(ob));
        freetri.add_mor(h, x, z, FinMor::Id(ob));

        let mut quad = UstrDiscreteDblModel::new(theory);
        quad.add_ob(q, ob);
        quad.add_ob(x, ob);
        quad.add_ob(y, ob);
        quad.add_ob(z, ob);
        quad.add_mor(f, x, y, FinMor::Id(ob));
        quad.add_mor(g, y, z, FinMor::Id(ob));
        quad.add_mor(i, y, q, FinMor::Id(ob));
        quad.add_mor(j, x, q, FinMor::Id(ob));

        assert_eq!(
            DiscreteDblModelMapping::morphisms(&freetri, &quad)
                .faithful()
                .find_all()
                .into_iter()
                .len(),
            1
        );
    }
}
