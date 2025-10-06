//! Morphisms between models of a discrete double theory.

use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use nonempty::NonEmpty;

use crate::dbl::{model::*, model_morphism::*};
use crate::one::graph_algorithms::{bounded_simple_paths, simple_paths, spec_order};
use crate::one::*;
use crate::validate::{self, Validate};
use crate::zero::{HashColumn, Mapping, MutMapping, QualifiedName};

/// A mapping between models of a discrete double theory.
///
/// Because a discrete double theory has only trivial operations, the naturality
/// axioms for a model morphism are also trivial.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DiscreteDblModelMapping(pub DiscreteDblModelMappingData);

type DiscreteDblModelMappingData = FpFunctorData<
    HashColumn<QualifiedName, QualifiedName>,
    HashColumn<QualifiedName, QualifiedPath>,
>;

impl DiscreteDblModelMapping {
    /// Constructs a model mapping from a pair of hash maps.
    pub fn new(
        ob_map: HashMap<QualifiedName, QualifiedName>,
        mor_map: HashMap<QualifiedName, QualifiedPath>,
    ) -> Self {
        Self(FpFunctorData::new(HashColumn::new(ob_map), HashColumn::new(mor_map)))
    }

    /// Assigns an object generator, returning the previous assignment.
    pub fn assign_ob(&mut self, x: QualifiedName, y: QualifiedName) -> Option<QualifiedName> {
        self.0.ob_generator_map.set(x, y)
    }

    /// Assigns a morphism generator, returning the previous assignment.
    pub fn assign_mor(&mut self, e: QualifiedName, n: QualifiedPath) -> Option<QualifiedPath> {
        self.0.mor_generator_map.set(e, n)
    }

    /// Unassigns an object generator, returning the previous assignment.
    pub fn unassign_ob(&mut self, x: &QualifiedName) -> Option<QualifiedName> {
        self.0.ob_generator_map.unset(x)
    }

    /// Unassigns a morphism generator, returning the previous assignment.
    pub fn unassign_mor(&mut self, e: &QualifiedName) -> Option<QualifiedPath> {
        self.0.mor_generator_map.unset(e)
    }

    /// Interprets the data as a functor into the given model.
    pub fn functor_into<'a>(
        &'a self,
        cod: &'a DiscreteDblModel,
    ) -> FpFunctor<'a, DiscreteDblModelMappingData, QualifiedFpCategory> {
        self.0.functor_into(&cod.category)
    }

    /// Finder of morphisms between two models of a discrete double theory.
    pub fn morphisms<'a>(
        dom: &'a DiscreteDblModel,
        cod: &'a DiscreteDblModel,
    ) -> DiscreteDblModelMorphismFinder<'a> {
        DiscreteDblModelMorphismFinder::new(dom, cod)
    }
}

/// A functor between models of a double theory.
///
/// This struct borrows its data to perform validation. The domain and codomain are
/// assumed to be valid models of double theories. If that is in question, the
/// models should be validated *before* validating this object.
pub struct DblModelMorphism<'a, Map, Dom, Cod>(pub &'a Map, pub &'a Dom, pub &'a Cod);

/// A morphism between models of a discrete double theory.
pub type DiscreteDblModelMorphism<'a> =
    DblModelMorphism<'a, DiscreteDblModelMapping, DiscreteDblModel, DiscreteDblModel>;

impl<'a> DiscreteDblModelMorphism<'a> {
    /// Iterates over failures of the mapping to be a model morphism.
    pub fn iter_invalid(
        &self,
    ) -> impl Iterator<Item = InvalidDblModelMorphism<QualifiedName, QualifiedName>> + 'a + use<'a>
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
            if let Some(y) = mapping.ob_generator_map.get(&x)
                && cod.has_ob(y)
                && dom.ob_type(&x) != cod.ob_type(y)
            {
                Some(InvalidDblModelMorphism::ObType(x))
            } else {
                None
            }
        });
        let th_cat = &cod.theory().0;
        let mor_type_errors = dom.mor_generators().filter_map(|f| {
            if let Some(g) = mapping.mor_generator_map.get(&f)
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

    /// Is the model morphism faithful?
    ///
    /// This check is a nontrivial computation since we cannot enumerate all of the
    /// morphisms of the domain category. We simplify the problem by only allowing
    /// free models. Furthermore, we restrict the mapping to send generating
    /// morphisms in the domain to simple paths in the codomain. If any of these
    /// assumptions are violated, the function will panic.
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

    /// Is the model morphism a monomorphism?
    ///
    /// A monomorphism in Cat is an injective on objects and faithful functor. Thus,
    /// we check injectivity on objects and faithfulness. Note that the latter check
    /// is subject to the same limitations as
    /// [`is_free_simple_faithful`](DblModelMorphism::is_free_simple_faithful).
    pub fn is_free_simple_monic(&self) -> bool {
        self.is_injective_objects() && self.is_free_simple_faithful()
    }
}

impl Validate for DiscreteDblModelMorphism<'_> {
    type ValidationError = InvalidDblModelMorphism<QualifiedName, QualifiedName>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

/// Finds morphisms between two models of a discrete double theory.
///
/// Morphisms are found using backtracking search. In general, there can be
/// infinitely many morphisms between two models, so not all of them can be
/// reported. The search is restricted to morphisms that send each basic morphism in
/// the domain to a [simple path](crate::one::graph_algorithms::simple_paths) of
/// basic morphisms in the codomain.
pub struct DiscreteDblModelMorphismFinder<'a> {
    dom: &'a DiscreteDblModel,
    cod: &'a DiscreteDblModel,
    map: DiscreteDblModelMapping,
    results: Vec<DiscreteDblModelMapping>,
    var_order: Vec<GraphElem<QualifiedName, QualifiedName>>,
    max_path_len: Option<usize>,
    injective_ob: bool,
    faithful: bool,
    ob_init: HashColumn<QualifiedName, QualifiedName>,
    mor_init: HashColumn<QualifiedName, QualifiedPath>,
    ob_inv: HashColumn<QualifiedName, QualifiedName>,
}

impl<'a> DiscreteDblModelMorphismFinder<'a> {
    fn new(dom: &'a DiscreteDblModel, cod: &'a DiscreteDblModel) -> Self {
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

    /// Restrict the search to model morphisms that are faithful.
    ///
    /// A faithful morphism is an injective map on morphisms when restricted to any
    /// domain/codomain pair of objects in the domain.
    ///
    /// In future work, this will be efficiently checked for early search tree
    /// pruning; however, this is currently enforced by filtering with
    /// [is_free_simple_faithful](DiscreteDblModelMorphism::is_free_simple_faithful).
    pub fn faithful(&mut self) -> &mut Self {
        self.faithful = true;
        self
    }

    /// Require morphisms to send object `ob` in domain to `val` in codomain.
    pub fn initialize_ob(&mut self, ob: QualifiedName, val: QualifiedName) -> &mut Self {
        self.ob_init.set(ob, val);
        self
    }

    /// Require morphisms to send morphism `m` in domain to `val` in codomain.
    pub fn initialize_mor(&mut self, m: QualifiedName, val: QualifiedPath) -> &mut Self {
        self.mor_init.set(m, val);
        self
    }

    /// Finds all morphisms.
    pub fn find_all(&mut self) -> Vec<DiscreteDblModelMapping> {
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
                    let th_cat = &self.cod.theory().0;
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
    fn assign_ob(&mut self, x: QualifiedName, y: QualifiedName) -> bool {
        if self.injective_ob && self.ob_inv.get(&y).is_some_and(|y_inv| *y_inv != x) {
            return false;
        }
        self.map.assign_ob(x.clone(), y.clone());
        self.ob_inv.set(y, x);
        true
    }

    /// Undo an object assignment.
    fn unassign_ob(&mut self, _: QualifiedName, y: QualifiedName) {
        self.ob_inv.unset(&y);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stdlib::*;
    use crate::validate::Validate;
    use crate::{one::Path, zero::name};

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

        let mut walking = DiscreteDblModel::new(th.clone());
        walking.add_ob(name("A"), name("Object"));
        walking.add_ob(name("B"), name("Object"));
        walking.add_mor(name("f"), name("A"), name("B"), Path::Id(name("Object")));

        //     y         Graph with lots of cyclic paths.
        //   ↗  ↘
        // ↻x ⇆ z
        let mut model = DiscreteDblModel::new(th);
        model.add_ob(name("X"), name("Object"));
        model.add_ob(name("Y"), name("Object"));
        model.add_ob(name("Z"), name("Object"));
        model.add_mor(name("xy"), name("X"), name("Y"), Path::Id(name("Object")));
        model.add_mor(name("yz"), name("Y"), name("Z"), Path::Id(name("Object")));
        model.add_mor(name("zx"), name("Z"), name("X"), Path::Id(name("Object")));
        model.add_mor(name("xz"), name("X"), name("Z"), Path::Id(name("Object")));
        model.add_mor(name("xx"), name("X"), name("X"), Path::Id(name("Object")));

        for i in model.ob_generators() {
            for j in model.ob_generators() {
                let maps: HashSet<_> = DiscreteDblModelMapping::morphisms(&walking, &model)
                    .initialize_ob(name("A"), i.clone())
                    .initialize_ob(name("B"), j.clone())
                    .find_all()
                    .into_iter()
                    .map(|map| map.functor_into(&model).apply_mor_generator(name("f")).unwrap())
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
            .map(|map| map.functor_into(&negative_feedback).apply_ob(base_pt.clone()))
            .collect();
        assert!(obs.contains(&Some(name("x"))));
        assert!(obs.contains(&Some(name("y"))));

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
            [(name("x"), name("x"))].into(),
            [(name(""), Path::Id(name("negative")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        assert!(dmm.validate().is_err());

        // A bad map from h to itself that is wrong for the ob (it is in the map
        // but sent to something that doesn't exist) and for the hom generator
        // (not in the map)
        let f = DiscreteDblModelMapping::new(
            [(name("x"), name("y"))].into(),
            [(name("y"), Path::Id(name("y")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        let errs: Vec<_> = dmm.validate().unwrap_err().into();
        assert!(
            errs == vec![
                InvalidDblModelMorphism::Ob(name("x")),
                InvalidDblModelMorphism::Mor(name("loop")),
            ]
        );

        // A bad map that doesn't preserve dom
        let f = DiscreteDblModelMapping::new(
            [(name("x"), name("x"))].into(),
            [(name("loop"), Path::single(name("positive1")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &posfeed);
        let errs: Vec<_> = dmm.validate().unwrap_err().into();
        assert!(
            errs == vec![
                InvalidDblModelMorphism::Cod(name("loop")),
                InvalidDblModelMorphism::MorType(name("loop")),
            ]
        );

        // A bad map that doesn't preserve codom
        let f = DiscreteDblModelMapping::new(
            [(name("x"), name("x"))].into(),
            [(name("loop"), Path::single(name("positive2")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &posfeed);
        let errs: Vec<_> = dmm.validate().unwrap_err().into();
        assert!(
            errs == vec![
                InvalidDblModelMorphism::Dom(name("loop")),
                InvalidDblModelMorphism::MorType(name("loop")),
            ]
        );
    }

    #[test]
    fn validate_is_free_simple_monic() {
        let theory = Rc::new(th_signed_category());
        let negloop = positive_loop(theory.clone());

        // Identity map
        let f = DiscreteDblModelMapping::new(
            [(name("x"), name("x"))].into(),
            [(name("loop"), Path::single(name("loop")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        assert!(dmm.validate().is_ok());
        assert!(dmm.is_free_simple_monic());

        // Send generator to identity
        let f = DiscreteDblModelMapping::new(
            [(name("x"), name("x"))].into(),
            [(name("loop"), Path::Id(name("x")))].into(),
        );
        let dmm = DblModelMorphism(&f, &negloop, &negloop);
        assert!(dmm.validate().is_ok());
        assert!(!dmm.is_free_simple_monic());
    }

    #[test]
    fn monic_constraint() {
        // The number of endomonomorphisms of a set |N| is N!.
        let theory = Rc::new(th_signed_category());
        let mut model = DiscreteDblModel::new(theory.clone());
        for id in ["Q", "X", "Y", "Z"] {
            model.add_ob(name(id), name("Object"));
        }
        let mors = DiscreteDblModelMapping::morphisms(&model, &model).monic().find_all();
        assert_eq!(mors.into_iter().len(), 4 * 3 * 2);

        // Hom from noncommuting triangle into a pair of triangles, only one one
        // of which commutes. There is only one morphism that is faithful.
        let mut freetri = DiscreteDblModel::new(theory.clone());
        for id in ["X", "Y", "Z"] {
            freetri.add_ob(name(id), name("Object"));
        }
        freetri.add_mor(name("f"), name("X"), name("Y"), Path::Id(name("Object")));
        freetri.add_mor(name("g"), name("Y"), name("Z"), Path::Id(name("Object")));
        freetri.add_mor(name("h"), name("X"), name("Z"), Path::Id(name("Object")));

        let mut quad = DiscreteDblModel::new(theory);
        for id in ["Q", "X", "Y", "Z"] {
            quad.add_ob(name(id), name("Object"));
        }
        quad.add_mor(name("f"), name("X"), name("Y"), Path::Id(name("Object")));
        quad.add_mor(name("g"), name("Y"), name("Z"), Path::Id(name("Object")));
        quad.add_mor(name("i"), name("Y"), name("Q"), Path::Id(name("Object")));
        quad.add_mor(name("j"), name("X"), name("Q"), Path::Id(name("Object")));
        let mors = DiscreteDblModelMapping::morphisms(&freetri, &quad).faithful().find_all();
        assert_eq!(mors.into_iter().len(), 1);
    }
}
