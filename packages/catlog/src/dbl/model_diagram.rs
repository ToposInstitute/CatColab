//! Diagrams in models of a double theory.
//!
//! A **diagram** in a [model](super::model) is simply a
//! [morphism](super::model_morphism) into that model. This includes the domain of
//! that morphism, which is assumed to be a free model.
//!
//! Diagrams are currently used primarily to represent instances of models from a
//! fibered perspective, generalizing how a diagram in a category can be used to
//! represent a copresheaf over that category.

use derive_more::Into;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use nonempty::NonEmpty;
use std::collections::HashSet;

use crate::dbl::{
    discrete::model::DiscreteDblModel, discrete::model_diagram::*, model::MutDblModel,
};
use crate::one::{
    QualifiedPath,
    category::{Category, FgCategory},
    functor::FgCategoryMap,
    graph::{FinGraph, Graph},
    graph_algorithms::bounded_simple_paths,
};
use crate::validate::{self};
use crate::zero::{HashColumn, QualifiedName, column::MutMapping};

/** A diagram in a model of a double theory.

This struct owns its data, namely, the domain of the diagram (a model) and the
model mapping itself.
*/
#[derive(Clone, Into, PartialEq)]
#[into(owned, ref, ref_mut)]
pub struct DblModelDiagram<Map, Dom>(pub Map, pub Dom);

/// A failure of a diagram in a model to be valid.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "err"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum InvalidDblModelDiagram<DomErr, MapErr> {
    /// Domain of the diagram is invalid.
    Dom(DomErr),

    /// Mapping underlying the diagram is invalid.
    Map(MapErr),
}

/// A morphism between instances (presented as diagrams in some model of a
/// double theory) consists in an assignment, for each representable `j` in the
/// domain instance, of a choice of representable `j'` in the codomain instance
/// plus a morphism in the underlying category out of the representing object of
/// `j'`.
///
/// For example, consider the schema for graphs as a model of the trivial double
/// theory. One sends some domain representable vertex `v` to the source of some
/// codomain representable edge, `e`. There may be no outgoing morphism for `e`
/// in the codomain shape category, but it's implicitly there because the the
/// morphism data of the v component comes from the underlying category.
///
///
/// Let `D: J → 𝒞` and `D': J' → 𝒞` be two diagrams. For any `j' ∈ J'`, let
/// `D'j'` be a functor `1 → 𝒞`, picking out `D'(j') ∈ 𝒞`. Consider the comma
/// category `D'j' ↓ D`:
/// - Its objects are pairs `(j ∈ J, D'j' → Dj ∈ Hom 𝒞)`
/// - Its morphisms are triples `(f: j₁ → j₂, s: D'j → Dj₁, t: D'j → Dj₂)` such
///   that `s;Df = t`
///
/// `π₀` is a functor `Cat → Set` sending each category to its set of connected
/// components.
///
/// `π₀(D'j' ↓ D)`, then, is a set with elements which are pairs `(j ∈ J, D'j' →
/// Dj ∈ Hom 𝒞)`, but we regard two as equal if there exists a zig-zag of
/// morphisms in `D'j' ↓ D`.
///
/// We are interested in `Hom(D, D')`, the morphisms between the instances
/// presented by `D` and `D'`. This is equal to `lim(π₀(D'j' ↓ D))` The
/// solutions to the limit problem are choices, for each `j ∈ J`, of some object
/// of `π₀(D'j' ↓ D)`, satisfying a universal property. These choices are the
/// components of the instance morphism.
///
/// This struct borrows its data to perform validation. The domain and codomain
/// are assumed to be valid models of double theories. If that is in question,
/// the models should be validated *before* validating this object.
pub struct InstanceMorphism<'a>(
    HashColumn<QualifiedName, (QualifiedName, QualifiedPath)>,
    pub &'a DiscreteDblModelDiagram,
    pub &'a DiscreteDblModelDiagram,
);

/// An instance morphism must provide a component for each element of the domain
/// MissingComponent marks if one is missing, whereas IllSpecifiedComponent
/// marks that the component is improperly specified somehow.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "err"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum InvalidInstanceMorphism {
    /// Domain of the diagram is invalid.
    MissingComponent(QualifiedName),

    /// Mapping underlying the diagram is invalid.
    IllSpecifiedComponent(String, QualifiedName),

    /// Mapping underlying the diagram is unnatural: (f: a->b, α(a), α(b)).
    UnnaturalComponent(QualifiedName),
}

impl DiscreteDblModelDiagram {
    /// Because morphisms within the shape `J` of a diagram `J → 𝒞` (viewed as
    /// an instance) are representing equalities, they can be traversed in
    /// either direction. Thus the same object `c` in `𝒞` be presented in
    /// multiple different ways, `(j1,D(j1)→c)` and `(j2,D(j2)→c)`, and showing
    /// they are different presentations of the same object involves traversing
    /// these morphisms in either direction.
    ///
    /// Given a diagram `D: J → 𝒞`, and a pair of `𝒞/c` objects `src: D(j1)→c`
    /// and `tgt: D(j2)→c`, decide whether *some* zigzag path of morphisms in
    /// `D` which connect `src` and `tgt` in 𝒞/c. This zigzag is found (if it
    /// exists) by starting with `src` and iteratively expanded the set of
    /// objects in `𝒞/c` which are in its connected component. There are two
    /// ways to do this for a given `m: D(j1)→c` which is in our connected
    /// component:
    ///
    /// Move 1: there is a morphism `f: j0→j1` in `J`. Therefore there is a
    /// morphism `D(f): D(j0)→D(j1)` in `𝒞`. This adds a *single* element to
    /// the connected component because the following triangle commutes:
    ///
    ///
    ///               D(f)
    ///         D(j0)  → D(j1)
    ///       D(f)⋅m ↘   ↙ m
    ///                c
    ///
    ///
    /// Move 2: there is a morphism `f: j1→j2` in `J`. Therefore there is a
    /// morphism `D(f): D(j1)→D(j2)` in `𝒞`. We then have new `𝒞/c` objects in
    /// our connected component for *every* `m'` in `𝒞` such that the following
    /// diagram in `𝒞` commutes:
    ///
    ///
    ///               D(f)
    ///         D(j1)  → D(j2)
    ///           m  ↘   ↙  m'
    ///                c
    ///
    ///
    /// We represent elements of `𝒞/c` with a path of generating morphisms in
    /// `𝒞`. There is a possibility of redundant work because multiple paths of
    /// generating morphisms may be equal to the same morphism; however, there
    /// is no canonical representative for such equivalence classes, and working
    /// with paths of generating morphisms allows us to control the max length
    /// of morphism we are willing to consider.
    ///
    /// There are some concerns about the accuracy of this approach when `𝒞`
    /// has loops, as it is not possible to fully enumerate all paths of
    /// morphism generators between two objects in `𝒞`. The `len` keyword
    /// prevents us from infinite iteration at the cost of some false negatives.
    /// 
    /// Note this algorithm does not need to look at the object / morphism
    /// *types* in `𝒞`.
    fn zigzag(
        &self,
        j1: QualifiedName,
        j2: QualifiedName,
        src: QualifiedPath,
        tgt: QualifiedPath,
        model: &DiscreteDblModel,
        len: Option<usize>,
    ) -> bool {
        let f = self.0.functor_into(model);

        // Our worklist represents the zigzags out of j1 that are in the same
        // connected component. We do not remember which zigzag in J it is, just
        // its domain object in J and the morphism's image in 𝒞.
        // So, each element in the work list is an object j (which is connected
        // to j1 via *some* sequence of morphisms in J) and a morphism D(j) → c
        // (we do not remember the sequence of morphisms, just the overall
        // composite)
        let mut worklist: Vec<(QualifiedName, QualifiedPath)> = vec![(j1.clone(), src.clone())];

        // If we ever come across a pair `(j, D(j) → c)` we have seen before,
        // then we do not need to add it to the worklist. Determining whether or
        // not `src` and `tgt` are in the same connected component does not need
        // us to track which particular sequence of zigs and zags led us to this
        // pair, so there is no need to track this data (any zigzag with a
        // cycle can be replaced by a zigzag without a cycle, thus we can
        // immediately stop when our search comes across an element of `𝒞/c` we
        // have seen before).
        let mut seen: HashSet<(QualifiedName, QualifiedPath)> = HashSet::new();

        let jg = self.1.generating_graph();
        let g = model.generating_graph();

        // This is the distinguished object in 𝒞 that we care about. We are
        // only interested in 𝒞/c for the purposes of determining whether `src`
        // and `tgt` are mutually reachable.
        let c = src.tgt(g);

        let dj1 = f.ob_generator_map().get(&j1).unwrap();
        let dj2 = f.ob_generator_map().get(&j2).unwrap();

        // Confirm that src and tgt are a cospan D(j1) → c ← D(j2)
        if *dj1 != src.src(g) {
            panic!("Bad input D({j1:?}) = {dj1:?} != src({src:?}")
        } else if *dj2 != tgt.src(g) {
            panic!("Bad input D({j2:?}) = {dj2:?} != src({tgt:?}")
        } else if c != tgt.tgt(g) {
            panic!("Bad input tgt({tgt:?})!={c:?}")
        }

        // Process worklist until it is empty. This will terminate because `len`
        // restricts us to looking at only a finite subset of the morphisms in
        // 𝒞/c, and there are only a finite number of objects in J, so there are
        // a finite number of (j, D(j) → c) pairs (which we will never repeat)
        while let Some((j, m)) = worklist.pop() {
            // Check if this pair is the tgt we have been trying to reach
            if model.morphisms_are_equal(m.clone(), tgt.clone()) {
                return true;
            } else if len.is_none_or(|n| m.len() < n) {
                // stop search if m too large
                // Add to seen cache
                seen.insert((j.clone(), m.clone()));

                // Move 1, above. `h: j' → j` in `J`. Then `(j', D(h) ⋅ m)` is
                // connected via a zig zag to `(j, m)`.
                for jh in jg.in_edges(&j) {
                    let new_j: QualifiedName = jg.src(&jh);
                    let h = f.mor_generator_map().get(&jh).unwrap().clone();
                    let new_m = h.concat_in(g, m.clone()).unwrap();
                    let new_tup = (new_j, new_m);
                    if !seen.contains(&new_tup) {
                        worklist.push(new_tup);
                    }
                }
                // Move 2, above. `h: j → j'` in `J`. Then `c ← j → D(j')` can be
                // completed to a slice morphism (j→c) in many ways: we search for
                // all morphisms `D(j') → c` that make the triangle commute.
                for jh in jg.out_edges(&j) {
                    let new_j = jg.tgt(&jh);

                    let h = f.mor_generator_map().get(&jh).unwrap();
                    // Look for morphisms `D(j') → c` bounded by max length
                    // minus current length (if there's a bound at all)
                    for new_m in bounded_simple_paths(g, &h.tgt(g), &c, len.map(|l| l - m.len())) {
                        // check that the triangle commutes
                        if model.morphisms_are_equal(
                            m.clone(),
                            h.clone().concat_in(g, new_m.clone()).unwrap(),
                        ) {
                            let new_tup = (new_j.clone(), new_m);
                            if !seen.contains(&new_tup) {
                                worklist.push(new_tup);
                            }
                        }
                    }
                }
            }
        }
        false // no zigzag (given `len`-limited exploration of 𝒞/c) exists
    }
}

impl<'a> InstanceMorphism<'a> {
    /** Validates that the instance morphism is well-defined.

    Assumes that the dom/codom diagrams are valid. If not, this may panic.
     */
    pub fn validate_in(
        &self,
        model: &DiscreteDblModel,
    ) -> Result<(), NonEmpty<InvalidInstanceMorphism>> {
        validate::wrap_errors(self.iter_invalid_in(model))
    }

    /// Iterates over failures of the diagram to be valid in the given model.
    pub fn iter_invalid_in(
        &'a self,
        model: &DiscreteDblModel,
    ) -> impl Iterator<Item = InvalidInstanceMorphism> + 'a {
        let mut errs = vec![];
        if !(self.1.validate_in(model).is_ok() && self.2.validate_in(model).is_ok()) {
            panic!("Invalid domain or codomain")
        }

        let cat_j = &self.1.1;
        let d = &self.1.0.0.ob_generator_map;
        let d_ = &self.2.0.0.ob_generator_map;

        for j in cat_j.ob_generators() {
            let Some((j_, f)) = self.0.get(&j) else {
                errs.push(InvalidInstanceMorphism::MissingComponent(j));
                continue;
            };

            let Some(dj) = d.get(&j) else {
                errs.push(InvalidInstanceMorphism::IllSpecifiedComponent(
                    format!("component {j:?} wrong "),
                    j,
                ));
                continue;
            };

            if model.cod(f) != *dj {
                errs.push(InvalidInstanceMorphism::IllSpecifiedComponent(
                    format!("cod({f:?}) != {dj:?} in C"),
                    j.clone(),
                ));
                continue;
            };
            let Some(d_j_) = d_.get(j_) else {
                errs.push(InvalidInstanceMorphism::IllSpecifiedComponent(
                    format!("ob {j:?} not found in J"),
                    j.clone(),
                ));
                continue;
            };
            if model.dom(f) != *d_j_ {
                errs.push(InvalidInstanceMorphism::IllSpecifiedComponent(
                    format!("dom({f:?}) != {d_j_:?} in C"),
                    j.clone(),
                ))
            }
        }
        if errs.is_empty() {
            // For all h: j1 → j2
            //
            //         D(h)
            //  D(j1) ---> D(j2)
            //    ^         ^
            //    | α(j1)   | α(j2)
            //    j1'      j2'
            //
            // Naturality consists of a zigzag in J' between
            // (j1', α(j1) ⋅ D(h)) and (j2', α(j2))
            for jh in cat_j.mor_generators() {
                let h =
                    self.1.0.0.functor_into(model).mor_generator_map().get(&jh).unwrap().clone();
                let j1 = self.1.1.get_dom(&jh).unwrap();
                let j2 = self.1.1.get_cod(&jh).unwrap();
                let (j_1, dom_comp) = self.0.get(j1).unwrap();
                let (j_2, cod_comp) = self.0.get(j2).unwrap();
                let comp_h =
                    dom_comp.clone().concat_in(model.generating_graph(), h.clone()).unwrap();
                if !self.2.zigzag(j_1.clone(), j_2.clone(), comp_h, cod_comp.clone(), model, None) {
                    errs.push(InvalidInstanceMorphism::UnnaturalComponent(jh))
                }
            }
        }
        errs.into_iter()
    }

    /// Determine if two presentations of instance morphisms present the same
    /// instance morphism. This is testing whether, for fixed `D` and `D'`,
    /// whether the assignments given by the underlying mapping of instance
    /// morphism produce equal instance morphisms. This presumes that both
    /// inputs have been validated: it may give incorrect results or panic
    /// otherwise.
    ///
    /// Note this is very strict> it requires domain and codomain categories of
    /// the diagrams to be *identical*, even though they often are considered
    /// equal up to some sort of equivalence.
    pub fn equiv(
        &self,
        other: &InstanceMorphism,
        model: &DiscreteDblModel,
        len: Option<usize>,
    ) -> bool {
        // No eq method yet.
        if self.1 != other.1 {
            panic!("Mismatched domain diagram");
        } else if self.2 != other.2 {
            panic!("Mismatched codomain diagram")
        }
        self.0.clone().into_iter().all(|(k, (j1, src))| {
            let (j2, tgt) = other.0.get(&k).unwrap();
            self.2.zigzag(j1, j2.clone(), src.clone(), tgt.clone(), model, len)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::dbl::discrete::model::DiscreteDblModel;
    use crate::dbl::discrete::model_morphism::DiscreteDblModelMapping;
    use crate::one::Path;
    use crate::validate::Validate;
    use crate::zero::name;
    use crate::{stdlib, tt};
    use std::rc::Rc;

    /// Helper function: parse a model of `th_schema` from a string
    fn mk_schema_model(source: Vec<&str>) -> DiscreteDblModel {
        let th = Rc::new(stdlib::th_schema());
        let maybe_model =
            tt::modelgen::Model::from_text(&th.into(), &mut format!("[{}]", source.join(",")));
        return maybe_model.and_then(|m| m.as_discrete()).unwrap();
    }

    /// Helper function: make a DblModelDiagram where the mapping only sends
    /// generators to generators.
    fn mk_diag(
        model: &DiscreteDblModel,
        source: Vec<&str>,
        ob_map: Vec<(&str, &str)>,
        hom_map: Vec<(&str, &str)>,
    ) -> DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel> {
        let map = DiscreteDblModelMapping::new(
            ob_map.into_iter().map(|(a, b)| (name(a), name(b))),
            hom_map.into_iter().map(|(a, b)| (name(a), name(b).into())),
        );
        let d = DblModelDiagram(map, mk_schema_model(source));
        assert!(d.1.validate().is_ok());
        assert!(d.validate_in(model).is_ok());
        return d;
    }

    /// Helper function: make an instance morphism
    fn mk_ihom<'a>(
        dom: &'a DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>,
        cod: &'a DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>,
        cs: Vec<(&str, &str, Vec<&str>)>,
    ) -> InstanceMorphism<'a> {
        let mapping = HashColumn::from_iter(cs.into_iter().map(|(a, b, c)| mk_component(a, b, c)));
        return InstanceMorphism(mapping, dom, cod);
    }

    /// Helper function: make a component of an instance morphism
    fn mk_component(
        dom_ob: &str,
        cod_ob: &str,
        pth: Vec<&str>,
    ) -> (QualifiedName, (QualifiedName, QualifiedPath)) {
        let pth_: Vec<_> = pth.into_iter().map(|x| name(x)).collect();
        (
            name(dom_ob),
            (
                name(cod_ob),
                match pth_[..] {
                    [] => {
                        panic!("EMPTY LIST: TODO use model to figure out id(-)")
                    }
                    _ => Path::from_vec(pth_).unwrap(),
                },
            ),
        )
    }

    // Defines two diagrams D1 and D2 in the following ThSchema model, C,
    // which consists in their (disjoint) images, plus two morphisms
    // connecting them.
    // The letters before names indicate whether something is an entity,
    // attrtype, hom, or attr.
    //
    ///    D1(J)  D2(J')
    ///    -----  ------
    ///
    ///        a21
    ///     a1 <- e2
    ///     |      | h21
    ///     |  ✓   v
    /// o10 |     e1                 (not labeled in diagram: a10 from e1 to a0)
    ///     |   /  ^
    ///     v  v ✓ | h01
    ///     a0 <- e0
    ///       a00
    ///
    /// The bottom triangle commutes always, and the input parameter `commutes`
    /// controls whether or not the top square commutes.
    ///
    /// Viewed as tabular instances, D1(J) is:
    ///
    /// | e0 |  | e1 |  | e2 | | a1 | o10 |  |  a0 |  
    /// ======  ======  ====== ============  =======
    ///                        |ja1 | ja0 |  | ja0 |   
    ///
    /// And D2(J') (if both polygons in C commute) is the terminal instance:
    ///
    /// | e0  | h01 | a00    |  | e1 |   a10  |  | e2 | h21 |    a21   |        
    /// ======================  ===============  =======================
    /// | je0 | je1 |a00(je0)|  |je1 |a00(je0)|  |je2 | je1 | a21(je2) |          
    ///  
    /// |    a1   |   o10   |     |    a0    |  
    /// =====================     ============
    /// |a21(je2) | a00(je0)|     | a00(je0) |  
    ///
    /// However, if the top square in C does not commute, D2(J') becomes:
    ///
    /// | e0  | h01 | a00    |  | e1 |   a10  |  | e2 | h21 |    a21   |        
    /// ======================  ===============  =======================
    /// | je0 | je1 |a00(je0)|  |je1 |a00(je0)|  |je2 | je1 | a21(je2) |          
    ///  
    /// |   a1    |   o10   |     |      a0      |  
    /// =====================     ================
    /// |a21(je2) | a00(je0)|     |    a00(je0)  |  
    ///                           | o10(a21(je1))|
    ///
    /// Returns a tuple: (C,D1,D2)
    fn create_diagrams(
        commutes: bool,
    ) -> (
        DiscreteDblModel,
        DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>,
        DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>,
    ) {
        // Commands to build a model `c` in ThSchema
        let mut cmds = vec![
            // Entities and homs
            "e0: Entity, e1: Entity, e2: Entity",
            "h01 : (Hom Entity)[e0, e1]",
            "h21 : (Hom Entity)[e2, e1]",
            // Attrtypes and ops
            "a0 : AttrType, a1 : AttrType",
            "o10 : (Hom AttrType)[a1, a0]",
            // Attrs
            "a21 : Attr[e2, a1]",
            "a00 : Attr[e0, a0]",
            "a10 : Attr[e1, a0]",
            // Eqs
            "eq: (a00 == h01 * a10)",
        ];

        if commutes {
            cmds.push("eq2: (a21 * o10 == h21 * a10)");
        }

        let c = mk_schema_model(cmds);

        // Validate `c`
        assert!(c.validate().is_ok());
        let eqn_len = 1 + (if commutes { 1 } else { 0 }); // # of eqs 
        assert!(c.category.equations().collect::<Vec<_>>().len() == eqn_len);

        // `d1` is the full submodel of `c` that includes elements 'a0' and 'a1'
        let d1 = mk_diag(
            &c,
            vec!["ja0 : AttrType", "ja1 : AttrType", "jo10 : (Hom AttrType)[ja1, ja0]"],
            vec![("ja0", "a0"), ("ja1", "a1")],
            vec![("jo10", "o10")],
        );

        // `d_` is the full submodel of `c` that includes `e0` `e1` `e2`
        let d2 = mk_diag(
            &c,
            vec![
                "je0 : Entity, je1 : Entity, je2: Entity",
                "jh01 : (Hom Entity)[je0, je1]",
                "jh21 : (Hom Entity)[je2, je1]",
            ],
            vec![("je0", "e0"), ("je1", "e1"), ("je2", "e2")],
            vec![("jh01", "h01"), ("jh21", "h21")],
        );

        return (c, d1, d2);
    }

    #[test]
    fn test_zigzag() {
        let (c, d1, d2) = create_diagrams(true);

        // There is a zig zag from `o10: D(ja1)→a0` to `id(a0): D(ja0)→a0`.
        // via the morphism `jo10: ja1 → ja0`.
        assert!(d1.zigzag(
            name("ja1"),
            name("ja0"),
            name("o10").into(),
            QualifiedPath::empty(name("a0")),
            &c,
            None,
        ));

        // Zig-zag is symmetric: we could also start with `id(a0): D(ja0)→a0`.
        assert!(d1.zigzag(
            name("ja0"),
            name("ja1"),
            QualifiedPath::empty(name("a0")),
            name("o10").into(),
            &c,
            None
        ));

        // Likewise there is a two-step zigzag from
        // `a21;o10: D'(j12) → a0` to `a00: D'(j10) → a0` via the
        // morphisms `jh01: j10→j11` and `jh21: j12→j11`.
        assert!(d2.zigzag(
            name("je2"),
            name("je0"),
            QualifiedPath::pair(name("a21"), name("o10")),
            name("a00").into(),
            &c,
            None
        ));

        // We don't find this zig-zag if our max-length is just 1
        assert!(d2.zigzag(
            name("je2"),
            name("je0"),
            QualifiedPath::pair(name("a21"), name("o10")),
            name("a00").into(),
            &c,
            Some(1)
        ));

        // This zig-zag relied on the top square in `C` commuting. If we
        // remove that, there is no longer a zig-zag.
        let (c, _, d2) = create_diagrams(false);
        assert!(!d2.zigzag(
            name("je2"),
            name("je0"),
            QualifiedPath::pair(name("a21"), name("o10")),
            name("a00").into(),
            &c,
            None
        ));
    }

    #[test]
    fn test_instance_morphism_validation() {
        let (c, d1, d2) = create_diagrams(true);
        // A good instance morphism
        assert!(
            mk_ihom(&d1, &d2, vec![("ja1", "je2", vec!["a21"]), ("ja0", "je0", vec!["a00"])],)
                .validate_in(&c)
                .is_ok()
        );

        // Same thing not good without the square commuting in underlying model
        let (cbad, d1bad, d2bad) = create_diagrams(false);

        assert!(
            mk_ihom(&d1bad, &d2bad, vec![("ja1", "je2", vec!["a21"]), ("ja0", "je0", vec!["a00"])],)
                .validate_in(&cbad)
                == Err(NonEmpty::new(InvalidInstanceMorphism::UnnaturalComponent(
                    name("jo10").into()
                )))
        );

        // Missing a component
        assert!(mk_ihom(&d1, &d2, vec![("ja1", "je2", vec!["a21"])],).validate_in(&c).is_err());

        // Unnatural (bad target)
        assert!(
            mk_ihom(&d1, &d2, vec![("ja1", "je2", vec!["h21"]), ("ja0", "je0", vec!["a00"])],)
                .validate_in(&c)
                .is_err()
        );

        // Unnatural (bad src)
        assert!(
            mk_ihom(&d1, &d2, vec![("ja1", "je2", vec!["a21"]), ("ja0", "je0", vec!["a10"])],)
                .validate_in(&c)
                .is_err()
        );
    }

    #[test]
    fn test_instance_morphism_equivalence() {
        let (c, d1, d2) = create_diagrams(true);

        let im = mk_ihom(&d1, &d2, vec![("ja1", "je2", vec!["a21"]), ("ja0", "je0", vec!["a00"])]);

        let im2 = mk_ihom(
            &d1,
            &d2,
            vec![("ja1", "je2", vec!["a21"]), ("ja0", "je2", vec!["h21", "a10"])],
        );
        assert!(im2.validate_in(&c).is_ok());

        assert!(im.equiv(&im2, &c, None));
    }
}
