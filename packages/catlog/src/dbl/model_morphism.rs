/*! Morphisms between models of double theories.

A morphism between [models](super::model) consists of functions between objects
and between morphisms that are:

1. *Well-typed*: preserve object and morphism types
2. *Functorial*: preserve composition and identities
3. *Natural*: commute with object operations and morphism operations, possibly up
   to comparison maps

In mathematical terms, a model morphism is a natural transformation between lax
double functors. The natural transformation can be strict, pseudo, lax, or
oplax. For models of *discrete* double theories, all these options coincide.

# References

- [Paré 2011](crate::refs::DblYonedaTheory), Section 1.5: Natural
  transformations
- [Lambert & Patterson 2024](crate::refs::CartDblTheories),
  Section 7: Lax transformations
 */

use std::collections::{HashMap, HashSet};
use std::hash::Hash;
use std::rc::Rc;

use derivative::Derivative;
use nonempty::NonEmpty;
use thiserror::Error;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::one::graph_algorithms::{bounded_simple_paths, simple_paths, spec_order};
use crate::one::*;
use crate::validate::{self, Validate};
use crate::zero::{Column, HashColumn, Mapping, MutMapping};

use super::model::*;

/** A mapping between models of a discrete double theory.

Because a discrete double theory has only trivial operations, the naturality
axioms for a model morphism are also trivial.
 */
#[derive(Clone, Debug, Derivative)]
#[derivative(Default(bound = ""))]
#[derivative(PartialEq(bound = "DomId: Eq + Hash, CodId: PartialEq"))]
pub struct DiscreteDblModelMapping<DomId, CodId>(
    pub FpFunctorData<HashColumn<DomId, CodId>, HashColumn<DomId, Path<CodId, CodId>>>,
);

impl<DomId, CodId> DiscreteDblModelMapping<DomId, CodId>
where
    DomId: Clone + Eq + Hash,
    CodId: Clone + Eq + Hash,
{
    /// Constructs a model mapping from a pair of hash maps.
    pub fn new(ob_map: HashMap<DomId, CodId>, mor_map: HashMap<DomId, Path<CodId, CodId>>) -> Self {
        Self(FpFunctorData::new(HashColumn::new(ob_map), HashColumn::new(mor_map)))
    }

    /// Assigns an object generator, returning the previous assignment.
    pub fn assign_ob(&mut self, x: DomId, y: CodId) -> Option<CodId> {
        self.0.ob_generator_map_mut().set(x, y)
    }

    /// Assigns a morphism generator, returning the previous assignment.
    pub fn assign_mor(&mut self, e: DomId, n: Path<CodId, CodId>) -> Option<Path<CodId, CodId>> {
        self.0.mor_generator_map_mut().set(e, n)
    }

    /// Unassigns an object generator, returning the previous assignment.
    pub fn unassign_ob(&mut self, x: &DomId) -> Option<CodId> {
        self.0.ob_generator_map_mut().unset(x)
    }

    /// Unassigns a morphism generator, returning the previous assignment.
    pub fn unassign_mor(&mut self, e: &DomId) -> Option<Path<CodId, CodId>> {
        self.0.mor_generator_map_mut().unset(e)
    }

    /// Interprets the data as a functor into the given model.
    pub fn functor_into<'a, Cat: FgCategory>(
        &'a self,
        cod: &'a DiscreteDblModel<CodId, Cat>,
    ) -> impl FgCategoryMap<
        DomOb = DomId,
        DomMor = Path<DomId, DomId>,
        CodOb = CodId,
        CodMor = Path<CodId, CodId>,
        ObGen = DomId,
        MorGen = DomId,
    > {
        self.0.functor_into(&cod.category)
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
    pub fn syntactic_image<Cat: FgCategory>(
        &self,
        cod: &DiscreteDblModel<CodId, Cat>,
    ) -> DiscreteDblModel<CodId, Cat>
    where
        Cat::Ob: Hash,
        Cat::Mor: Hash,
    {
        // TODO: For non-free models, we should filter the equations to those
        // involving only generators that appear in the image.
        assert!(cod.is_free(), "Codomain model should be free");

        let mut im = DiscreteDblModel::new(cod.theory_rc());
        for x in self.0.ob_generator_map().values() {
            im.add_ob(x.clone(), cod.ob_type(x));
        }
        for path in self.0.mor_generator_map().values() {
            for e in path.iter() {
                let (x, y) = (cod.mor_generator_dom(e), cod.mor_generator_cod(e));
                if !im.has_ob(&x) {
                    im.add_ob(x.clone(), cod.ob_type(&x));
                }
                if !im.has_ob(&y) {
                    im.add_ob(y.clone(), cod.ob_type(&y));
                }
                im.add_mor(e.clone(), x, y, cod.mor_generator_type(e));
            }
        }
        im
    }

    /// Finder of morphisms between two models of a discrete double theory.
    pub fn morphisms<'a, Cat: FgCategory>(
        dom: &'a DiscreteDblModel<DomId, Cat>,
        cod: &'a DiscreteDblModel<CodId, Cat>,
    ) -> DiscreteDblModelMorphismFinder<'a, DomId, CodId, Cat>
    where
        Cat::Ob: Hash,
        Cat::Mor: Hash,
    {
        DiscreteDblModelMorphismFinder::new(dom, cod)
    }
}

/** A functor between models of a double theory.

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
    pub fn iter_invalid(
        &self,
    ) -> impl Iterator<Item = InvalidDblModelMorphism<DomId, DomId>> + 'a + use<'a, DomId, CodId, Cat>
    {
        let DblModelMorphism(DiscreteDblModelMapping(mapping), dom, cod) = *self;
        let category_errors: Vec<_> = mapping
            .functor_into(&cod.category)
            .iter_invalid_on(&dom.category)
            .map(|err| match err {
                InvalidFpFunctor::ObGen(x) => InvalidDblModelMorphism::Ob(x),
                InvalidFpFunctor::MorGen(m) => InvalidDblModelMorphism::Mor(m),
                InvalidFpFunctor::Dom(m) => InvalidDblModelMorphism::Dom(m),
                InvalidFpFunctor::Cod(m) => InvalidDblModelMorphism::Cod(m),
                InvalidFpFunctor::Eq(id) => InvalidDblModelMorphism::Eq(id),
            })
            .collect();
        let ob_type_errors = dom.ob_generators().filter_map(|x| {
            if let Some(y) = mapping.ob_generator_map().get(&x)
                && cod.has_ob(y)
                && dom.ob_type(&x) != cod.ob_type(y)
            {
                Some(InvalidDblModelMorphism::ObType(x))
            } else {
                None
            }
        });
        let th_cat = cod.theory().category();
        let mor_type_errors = dom.mor_generators().filter_map(|f| {
            if let Some(g) = mapping.mor_generator_map().get(&f)
                && cod.has_mor(g)
                && !th_cat.morphisms_are_equal(dom.mor_generator_type(&f), cod.mor_type(g))
            {
                Some(InvalidDblModelMorphism::MorType(f))
            } else {
                None
            }
        });
        category_errors.into_iter().chain(ob_type_errors).chain(mor_type_errors)
    }

    /// Are morphism generators sent to simple composites of morphisms in the
    /// codomain?
    fn is_simple(&self) -> bool {
        let DblModelMorphism(DiscreteDblModelMapping(mapping), dom, _) = *self;
        dom.mor_generators()
            .all(|e| mapping.apply_edge(e).map(|p| p.is_simple()).unwrap_or(true))
    }

    /// Is the model morphism injective on objects?
    pub fn is_injective_objects(&self) -> bool {
        let DblModelMorphism(DiscreteDblModelMapping(mapping), dom, _) = *self;
        let mut seen_obs: HashSet<_> = HashSet::new();
        for x in dom.ob_generators() {
            if let Some(f_x) = mapping.apply_vertex(x) {
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
        let DblModelMorphism(DiscreteDblModelMapping(mapping), dom, cod) = *self;

        assert!(dom.is_free(), "Domain model should be free");
        assert!(cod.is_free(), "Codomain model should be free");
        assert!(self.is_simple(), "Morphism assignments should be simple");

        let functor = mapping.functor_into(&cod.category);
        for x in dom.ob_generators() {
            for y in dom.ob_generators() {
                let mut seen: HashSet<_> = HashSet::new();
                for path in simple_paths(dom.generating_graph(), &x, &y) {
                    if let Some(f_path) = functor.apply_mor(path) {
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

/// An invalid assignment in a morphism between models of a double theory.
#[derive(Clone, Debug, Error, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum InvalidDblModelMorphism<ObGen, MorGen> {
    /// An object generator not mapped to an object in the codomain model.
    #[error("Object generator `{0}` is not mapped to an object in the codomain")]
    Ob(ObGen),

    /// A morphism generator not mapped to a morphism in the codomain model.
    #[error("Morphism generator `{0}` is not mapped to a morphism in the codomain")]
    Mor(MorGen),

    /// A morphism generator whose domain is not preserved.
    #[error("Domain of morphism generator `{0}` is not preserved")]
    Dom(MorGen),

    /// A morphism generator whose codomain is not preserved.
    #[error("Codomain of morphism generator `{0}` is not preserved")]
    Cod(MorGen),

    /// An object generator whose type is not preserved.
    #[error("Object `{0}` is not mapped to an object of the same type in the codomain")]
    ObType(ObGen),

    /// A morphism generator whose type is not preserved.
    #[error("Morphism `{0}` is not mapped to a morphism of the same type in the codomain")]
    MorType(MorGen),

    /// A path equation in domain presentation that is not respected.
    #[error("Path equation `{0}` is not respected")]
    Eq(usize),
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
    max_path_len: Option<usize>,
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
            Rc::ptr_eq(&dom.theory_rc(), &cod.theory_rc()),
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
            max_path_len: None,
            injective_ob: false,
            faithful: false,
            ob_init: Default::default(),
            mor_init: Default::default(),
            ob_inv: Default::default(),
        }
    }

    /// Restrict the maximum length of the image of a generator.
    pub fn max_path_len(&mut self, n: usize) -> &mut Self {
        self.max_path_len = Some(n);
        self
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
                if let Some(y) = self.ob_init.apply_to_ref(&x) {
                    let can_assign = self.assign_ob(x.clone(), y.clone());
                    if can_assign {
                        self.search(depth + 1);
                        self.unassign_ob(x, y)
                    }
                } else {
                    for y in self.cod.ob_generators_with_type(&self.dom.ob_type(&x)) {
                        let can_assign = self.assign_ob(x.clone(), y.clone());
                        if can_assign {
                            self.search(depth + 1);
                            self.unassign_ob(x.clone(), y)
                        }
                    }
                }
            }
            GraphElem::Edge(m) => {
                if let Some(path) = self.mor_init.apply_to_ref(&m) {
                    self.map.assign_mor(m, path);
                    self.search(depth + 1);
                } else {
                    let functor = self.map.0.functor_into(&self.cod.category);
                    let mor_type = self.dom.mor_generator_type(&m);
                    let w = functor
                        .apply_ob(self.dom.mor_generator_dom(&m))
                        .expect("Domain should already be assigned");
                    let z = functor
                        .apply_ob(self.dom.mor_generator_cod(&m))
                        .expect("Codomain should already be assigned");

                    let cod_graph = self.cod.generating_graph();
                    let th_cat = self.cod.theory().category();
                    for path in bounded_simple_paths(cod_graph, &w, &z, self.max_path_len) {
                        if th_cat.morphisms_are_equal(self.cod.mor_type(&path), mor_type.clone())
                            && !(self.faithful && path.is_empty())
                        {
                            self.map.assign_mor(m.clone(), path);
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
            if let Some(y_inv) = self.ob_inv.get(&y) {
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
    use ustr::ustr;

    use super::*;
    use crate::dbl::model::UstrDiscreteDblModel;
    use crate::one::Path;
    use crate::stdlib::*;
    use crate::validate::Validate;

    #[test]
    fn find_positive_loops() {
        let th = Rc::new(th_signed_category());
        let positive_loop = positive_loop(th.clone());
        let pos = positive_loop.mor_generators().next().unwrap().into();

        let maps = DiscreteDblModelMapping::morphisms(&positive_loop, &positive_loop).find_all();
        assert_eq!(maps.len(), 2);
        let mors: Vec<_> = maps
            .into_iter()
            .map(|map| map.functor_into(&positive_loop).mor_map().apply_to_ref(&pos))
            .collect();
        assert!(mors.iter().any(|mor| matches!(mor, Some(Path::Id(_)))));
        assert!(mors.iter().any(|mor| matches!(mor, Some(Path::Seq(_)))));

        let maps = DiscreteDblModelMapping::morphisms(&positive_loop, &positive_loop)
            .monic()
            .find_all();
        assert_eq!(maps.len(), 1);
        assert!(matches!(
            maps[0].functor_into(&positive_loop).apply_mor(pos),
            Some(Path::Seq(_))
        ));
    }

    /// The [simple path](crate::one::graph_algorithms::simple_paths) should
    /// give identical results to hom search from a walking morphism (assuming
    /// all the object/morphism types are the same).   
    #[test]
    fn find_simple_paths() {
        let th = Rc::new(th_signed_category());

        let mut walking = UstrDiscreteDblModel::new(th.clone());
        let (a, b) = (ustr("A"), ustr("B"));
        walking.add_ob(a, ustr("Object"));
        walking.add_ob(b, ustr("Object"));
        walking.add_mor(ustr("f"), a, b, Path::Id(ustr("Object")));

        //     y         Graph with lots of cyclic paths.
        //   ↗  ↘
        // ↻x ⇆ z
        let mut model = UstrDiscreteDblModel::new(th);
        let (x, y, z) = (ustr("X"), ustr("Y"), ustr("Z"));
        model.add_ob(x, ustr("Object"));
        model.add_ob(y, ustr("Object"));
        model.add_ob(z, ustr("Object"));
        model.add_mor(ustr("xy"), x, y, Path::Id(ustr("Object")));
        model.add_mor(ustr("yz"), y, z, Path::Id(ustr("Object")));
        model.add_mor(ustr("zx"), z, x, Path::Id(ustr("Object")));
        model.add_mor(ustr("xz"), x, z, Path::Id(ustr("Object")));
        model.add_mor(ustr("xx"), x, x, Path::Id(ustr("Object")));

        for i in model.ob_generators() {
            for j in model.ob_generators() {
                let maps: HashSet<_> = DiscreteDblModelMapping::morphisms(&walking, &model)
                    .initialize_ob(ustr("A"), i)
                    .initialize_ob(ustr("B"), j)
                    .find_all()
                    .into_iter()
                    .map(|map| map.functor_into(&model).apply_mor_generator(ustr("f")).unwrap())
                    .collect();
                let spaths: HashSet<_> = simple_paths(model.generating_graph(), &i, &j).collect();
                assert_eq!(maps, spaths);
            }
        }
    }

    #[test]
    fn find_negative_loops() {
        let th = Rc::new(th_signed_category());
        let negative_loop = negative_loop(th.clone());
        let base_pt = negative_loop.ob_generators().next().unwrap();

        let negative_feedback = negative_feedback(th);
        let maps = DiscreteDblModelMapping::morphisms(&negative_loop, &negative_feedback)
            .max_path_len(2)
            .find_all();
        assert_eq!(maps.len(), 2);
        let obs: Vec<_> = maps
            .iter()
            .map(|map| map.functor_into(&negative_feedback).apply_ob(base_pt))
            .collect();
        assert!(obs.contains(&Some(ustr("x"))));
        assert!(obs.contains(&Some(ustr("y"))));

        let im = maps[0].syntactic_image(&negative_feedback);
        assert!(im.validate().is_ok());
        assert!(im.has_mor(&Path::single(ustr("positive"))));
        assert!(im.has_mor(&Path::single(ustr("negative"))));

        let maps = DiscreteDblModelMapping::morphisms(&negative_loop, &negative_feedback)
            .max_path_len(1)
            .find_all();
        assert!(maps.is_empty());
    }

    #[test]
    fn validate_model_morphism() {
        let theory = Rc::new(th_signed_category());
        let negloop = negative_loop(theory.clone());
        let posfeed = positive_feedback(theory.clone());

        let f = DiscreteDblModelMapping::new(
            [(ustr("x"), ustr("x"))].into(),
            [(ustr(""), Path::Id(ustr("negative")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        assert!(dmm.validate().is_err());

        // A bad map from h to itself that is wrong for the ob (it is in the map
        // but sent to something that doesn't exist) and for the hom generator
        // (not in the map)
        let f = DiscreteDblModelMapping::new(
            [(ustr("x"), ustr("y"))].into(),
            [(ustr("y"), Path::Id(ustr("y")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        let errs: Vec<_> = dmm.validate().unwrap_err().into();
        assert!(
            errs == vec![
                InvalidDblModelMorphism::Ob(ustr("x")),
                InvalidDblModelMorphism::Mor(ustr("loop")),
            ]
        );

        // A bad map that doesn't preserve dom
        let f = DiscreteDblModelMapping::new(
            [(ustr("x"), ustr("x"))].into(),
            [(ustr("loop"), Path::single(ustr("positive1")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &posfeed);
        let errs: Vec<_> = dmm.validate().unwrap_err().into();
        assert!(
            errs == vec![
                InvalidDblModelMorphism::Cod(ustr("loop")),
                InvalidDblModelMorphism::MorType(ustr("loop")),
            ]
        );

        // A bad map that doesn't preserve codom
        let f = DiscreteDblModelMapping::new(
            [(ustr("x"), ustr("x"))].into(),
            [(ustr("loop"), Path::single(ustr("positive2")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &posfeed);
        let errs: Vec<_> = dmm.validate().unwrap_err().into();
        assert!(
            errs == vec![
                InvalidDblModelMorphism::Dom(ustr("loop")),
                InvalidDblModelMorphism::MorType(ustr("loop")),
            ]
        );
    }

    #[test]
    fn validate_is_free_simple_monic() {
        let theory = Rc::new(th_signed_category());
        let negloop = positive_loop(theory.clone());

        // Identity map
        let f = DiscreteDblModelMapping::new(
            [(ustr("x"), ustr("x"))].into(),
            [(ustr("loop"), Path::single(ustr("loop")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        assert!(dmm.validate().is_ok());
        assert!(dmm.is_free_simple_monic());

        // Send generator to identity
        let f = DiscreteDblModelMapping::new(
            [(ustr("x"), ustr("x"))].into(),
            [(ustr("loop"), Path::Id(ustr("x")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        assert!(dmm.validate().is_ok());
        assert!(!dmm.is_free_simple_monic());
    }

    #[test]
    fn monic_constraint() {
        // The number of endomonomorphisms of a set |N| is N!.
        let theory = Rc::new(th_signed_category());
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
        freetri.add_mor(f, x, y, Path::Id(ob));
        freetri.add_mor(g, y, z, Path::Id(ob));
        freetri.add_mor(h, x, z, Path::Id(ob));

        let mut quad = UstrDiscreteDblModel::new(theory);
        quad.add_ob(q, ob);
        quad.add_ob(x, ob);
        quad.add_ob(y, ob);
        quad.add_ob(z, ob);
        quad.add_mor(f, x, y, Path::Id(ob));
        quad.add_mor(g, y, z, Path::Id(ob));
        quad.add_mor(i, y, q, Path::Id(ob));
        quad.add_mor(j, x, q, Path::Id(ob));

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
