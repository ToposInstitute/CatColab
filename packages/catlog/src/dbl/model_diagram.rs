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

/// WARNING/TODO: these docs are incomplete
///
/// A morphism between instances (presented as diagrams in some category)
/// consists in an assignment, for each representable j in the domain instance,
/// of a choice of representable j' in the codomain instance plus a morphism in
/// the underlying category out of the representing object of j'.
///
/// For example, one sends some domain representable vertex v to the source of
/// some codomain representable edge, e. There may be no outgoing morphism for e
/// in the codomain shape category, but it's implicitly there because the
/// the morphism data of the v component comes from the underlying category.
///
///
/// Let D: J → 𝒞 and D': J' → 𝒞 be two diagrams.
/// For any j' ∈ J', let D'j' be a functor 1 → 𝒞, picking out D'(j') ∈ 𝒞.
/// Consider the comma category D'j' ↓ D:
/// - Its objects are pairs (j ∈ J, D'j' → Dj ∈ Hom 𝒞)
/// - Its morphisms are triples (f: j₁ → j₂, s: D'j → Dj₁, t: D'j → Dj₂)
///   such that s;Df = t
///
/// π₀ is a functor Cat → Set sending each category to its set of connected
/// components.
///
/// π₀(D'j' ↓ D), then, is a set with elements which are pairs
/// (j ∈ J, D'j' → Dj ∈ Hom 𝒞), but we regard two as equal if there exists a
/// zig-zag of morphisms in D'j' ↓ D.
///
/// We are interested in Hom(D,D'), the morphisms between the instances
/// presented by D and D'. This is equal to lim(π₀(D'j' ↓ D))
/// The solutions to the limit problem are a choice, for each j ∈ J, of some
/// object of π₀(D'j' ↓ D), such that for all q: j₁ → j₂, there is a morphism
/// α(j₁) in 𝒞 such that ...
///
///
/// This struct borrows its data to perform validation. The domain and codomain are
/// assumed to be valid models of double theories. If that is in question, the
/// models should be validated *before* validating this object.
pub struct InstanceMorphism<'a>(
    pub &'a HashColumn<QualifiedName, (QualifiedName, QualifiedPath)>,
    pub &'a DiscreteDblModelDiagram,
    pub &'a DiscreteDblModelDiagram,
);

/// An instance morphism must provide a component for each element of the domain
/// MissingComponent marks if one is missing, whereas IllSpecifiedComponent marks
/// that the component is improperly specified somehow.
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

    /// Mapping underlying the diagram is unnatural. (f: a->b, α(a), α(b))
    UnnaturalComponent(QualifiedName),
}

impl DiscreteDblModelDiagram {
    /// WARNING: this code ignores the ob/mor types in model.generating_graph
    /// this could lead to spurious morphisms - we really should be making sure
    /// we respect the coloring in some to-be-specified way.
    ///
    /// Because morphisms within the shape J of a diagram J → 𝒞 are representing
    /// equalities, they can be traversed in either direction. The natural
    /// notion of the same object c in 𝒞 be presented in two different ways,
    /// (j1,D(j1)→c) and (j2,D(j2)→c), involves traversing these morphisms in
    /// either direction.
    ///
    /// Given a diagram D: J → 𝒞, and a cospan of 𝒞 morphisms src: D(j1)→c
    /// and tgt: D(j2)→c, decide whether *some* zigzag path of morphisms in D/c
    /// from src to tgt.
    ///
    /// There are some concerns about the accuracy of this approach when 𝒞 has
    /// loops, as it is not possible to fully enumerate all paths of morphism
    /// generators between two objects in 𝒞. Thus there may be false negatives.
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
        let mut worklist: Vec<(QualifiedName, QualifiedPath)> = vec![(j1.clone(), src.clone())];

        // If we ever come across a pair (j, D(j) → c) we have seen before,
        // then we do not need to add it to the worklist. Determining whether or
        // not src and tgt are in the same connected component does not need us
        // to track which zig zag in particular led us to this pair, so there is
        // no need to ever have cycles in our tree search.
        let mut seen: HashSet<(QualifiedName, QualifiedPath)> = HashSet::new();

        let jg = self.1.generating_graph();
        let g = model.generating_graph();

        // This is the distinguished object in 𝒞 that we care about. We are only
        // interested in 𝒞/c for the purposes of determining whether src and tgt
        // are mutually reachable.
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
            }

            // Add to seen cache
            seen.insert((j.clone(), m.clone()));

            // Suppose h: j' → j in J. Then (j', D(h) ⋅ m ) is connected via a
            // zig zag to (j, m).
            for jh in jg.in_edges(&j) {
                let new_j: QualifiedName = jg.src(&jh);
                let h = f.mor_generator_map().get(&jh).unwrap().clone();
                let new_m = h.concat_in(g, m.clone()).unwrap();
                let new_tup = (new_j, new_m);
                if !seen.contains(&new_tup) {
                    worklist.push(new_tup);
                }
            }
            // Suppose h: j → j' in J. Then c ← j → D(j') can be completed to a
            // commuting triangle in many ways: we search for all morphisms
            // D(j') → c that make the triangle commute.
            for jh in jg.out_edges(&j) {
                let new_j = jg.tgt(&jh);

                let h = f.mor_generator_map().get(&jh).unwrap();
                for new_m in bounded_simple_paths(g, &h.tgt(g), &c, len) {
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
    /// instance morphism.
    /// Note this is still too strict: we require domain and codomain categories
    /// of the diagrams to be *identical*, even though they should be considered
    /// equal up to some sort of equivalence.
    /// This is testing whether, for fixed D and D', whether the assignments
    /// given by the underlying mapping of instance morphism produce equal
    /// instance morphisms.
    /// Presumes that both inputs have been validated - may give incorrect
    /// results or panic otherwise.
    pub fn equiv(&self, other: &InstanceMorphism, model: &DiscreteDblModel) -> bool {
        // No eq method yet.
        if self.1 != other.1 {
            panic!("Mismatched domain diagram");
        } else if self.2 != other.2 {
            panic!("Mismatched codomain diagram")
        }
        self.0.clone().into_iter().all(|(k, (j1, src))| {
            let (j2, tgt) = other.0.get(&k).unwrap();
            self.2.zigzag(j1, j2.clone(), src.clone(), tgt.clone(), model, None)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::dbl::discrete::model::DiscreteDblModel;
    use crate::dbl::discrete::model_morphism::DiscreteDblModelMapping;
    use crate::one::{Path, PathEq};
    use crate::tt::{
        batch::PARSE_CONFIG,
        modelgen::generate,
        text_elab::Elaborator,
        toplevel::{Theory, Toplevel, std_theories},
    };
    use crate::validate::Validate;
    use std::rc::Rc;
    use tattle::Reporter;

    use crate::stdlib::*;
    use crate::zero::name;

    /// Make a model of the trivial double theory from a string
    fn mk_model(s: &str) -> DiscreteDblModel {
        let th_ = Rc::new(th_category());
        let th = Theory::new("".into(), th_.clone());

        let reporter = Reporter::new();
        let toplevel = Toplevel::new(std_theories());

        PARSE_CONFIG
            .with_parsed(s, reporter.clone(), |n| {
                let mut elaborator = Elaborator::new(th.clone(), reporter.clone(), &toplevel);
                let (_, ty_v) = elaborator.ty(n)?;
                let (model, _) = generate(&toplevel, &th, &ty_v);
                Some(model)
            })
            .unwrap()
    }

    // First we define two diagrams D and D' in the following category, C,
    // which consists in their (disjoint) images, plus two morphisms
    // connecting them.
    //
    /// D(J) D'(J')
    /// ---  ----
    ///  02 <- 12
    ///  |     |
    ///  |  ✓  v
    ///  |     11
    ///  |  /  ^
    ///  v v ✓ |
    ///  00 <- 10
    ///
    /// Returns a tuple: (C,D,D')
    fn create_two_diagrams(
        commutes: bool,
    ) -> (
        DiscreteDblModel,
        DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>,
        DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>,
    ) {
        let mut c = mk_model(
            "[
            o00 : Object, o02 : Object, o10: Object, o11: Object, o12: Object,
            m02_00 : (Id Object)[o02, o00], m10_00 : (Id Object)[o10, o00],
            m11_00 : (Id Object)[o11, o00], m10_11 : (Id Object)[o10, o11],
            m12_11 : (Id Object)[o12, o11], m12_02 : (Id Object)[o12, o02]
        ]",
        );

        c.add_equation(PathEq::new(
            name("m10_00").into(),
            Path::pair(name("m10_11"), name("m11_00")),
        ));
        if commutes {
            c.add_equation(PathEq::new(
                Path::pair(name("m12_02"), name("m02_00")),
                Path::pair(name("m12_11"), name("m11_00")),
            ));
        }
        assert!(!c.is_free());
        assert!(c.validate().is_ok());

        // J presents an instance on C with one 02 and one 00.
        let j = mk_model(
            "[
            j00 : Object, j02 : Object, j02_00 : (Id Object)[j02, j00]
        ]",
        );

        let mut dm: DiscreteDblModelMapping = Default::default();
        dm.assign_ob(name("j00"), name("o00"));
        dm.assign_ob(name("j02"), name("o02"));
        dm.assign_mor(name("j02_00"), name("m02_00").into());
        let d = DblModelDiagram(dm, j);

        assert!(d.validate_in(&c).is_ok());

        // J' presents the terminal instance on C
        let j_ = mk_model(
            "[
            j_10 : Object, j_11 : Object, j_12: Object, 
            j_10_11 : (Id Object)[j_10, j_11], j_12_11 : (Id Object)[j_12, j_11]
        ]",
        );

        let mut dm_: DiscreteDblModelMapping = Default::default();
        dm_.assign_ob(name("j_10"), name("o10"));
        dm_.assign_ob(name("j_11"), name("o11"));
        dm_.assign_ob(name("j_12"), name("o12"));
        dm_.assign_mor(name("j_10_11"), name("m10_11").into());
        dm_.assign_mor(name("j_12_11"), name("m12_11").into());
        let d_ = DblModelDiagram(dm_, j_);

        assert!(d_.validate_in(&c).is_ok());
        (c, d, d_)
    }

    #[test]
    fn test_zigzag() {
        let (c, d, d_) = create_two_diagrams(true);

        assert!(d.zigzag(
            name("j02"),
            name("j00"),
            name("m02_00").into(),
            QualifiedPath::empty(name("o00")),
            &c,
            None
        ));

        assert!(d.zigzag(
            name("j00"),
            name("j02"),
            QualifiedPath::empty(name("o00")),
            name("m02_00").into(),
            &c,
            None
        ));

        assert!(d_.zigzag(
            name("j_12"),
            name("j_10"),
            QualifiedPath::pair(name("m12_02"), name("m02_00")),
            name("m10_00").into(),
            &c,
            None
        ));

        // If one square of does not commute - there is no zig zag anymore.
        let (c, _, d_) = create_two_diagrams(false);
        assert!(!d_.zigzag(
            name("j_12"),
            name("j_10"),
            QualifiedPath::pair(name("m12_02"), name("m02_00")),
            name("m10_00").into(),
            &c,
            None
        ));
    }

    #[test]
    fn test_instance_morphism_validation() {
        let (c, d, d_) = create_two_diagrams(true);

        let m: HashColumn<QualifiedName, (QualifiedName, QualifiedPath)> = HashColumn::new(
            [
                (name("j02"), (name("j_12"), Path::single(name("m12_02")))),
                (name("j00"), (name("j_10"), Path::single(name("m10_00")))),
            ]
            .into(),
        );
        let im = InstanceMorphism(&m, &d, &d_);
        assert!(im.validate_in(&c).is_ok());

        // Try the same thing without the square commuting
        let (cbad, dbad, d_bad) = create_two_diagrams(false);

        let m: HashColumn<QualifiedName, (QualifiedName, QualifiedPath)> = HashColumn::new(
            [
                (name("j02"), (name("j_12"), Path::single(name("m12_02")))),
                (name("j00"), (name("j_10"), Path::single(name("m10_00")))),
            ]
            .into(),
        );
        let imbad = InstanceMorphism(&m, &dbad, &d_bad);
        assert!(
            imbad.validate_in(&cbad)
                == Err(NonEmpty::new(InvalidInstanceMorphism::UnnaturalComponent(
                    name("j02_00").into()
                )))
        );

        // Test for various errors
        // -----------------------
        // Missing a component
        let m: HashColumn<QualifiedName, (QualifiedName, QualifiedPath)> =
            HashColumn::new([(name("j02"), (name("j_12"), Path::single(name("m12_02"))))].into());
        let im = InstanceMorphism(&m, &d, &d_);
        assert!(im.validate_in(&c).is_err());

        // Unnatural (bad target)
        let m: HashColumn<QualifiedName, (QualifiedName, QualifiedPath)> = HashColumn::new(
            [
                (name("j02"), (name("j_12"), Path::single(name("m12_11")))),
                (name("j00"), (name("j_10"), Path::single(name("m10_00")))),
            ]
            .into(),
        );
        let im = InstanceMorphism(&m, &d, &d_);
        assert!(im.validate_in(&c).is_err());

        // Unnatural (bad src)
        let m: HashColumn<QualifiedName, (QualifiedName, QualifiedPath)> = HashColumn::new(
            [
                (name("j02"), (name("j_12"), Path::single(name("m12_11")))),
                (name("j00"), (name("j_10"), Path::single(name("m11_00")))),
            ]
            .into(),
        );
        let im = InstanceMorphism(&m, &d, &d_);
        assert!(im.validate_in(&c).is_err());
    }
    #[test]
    fn test_instance_morphism_equivalence1() {
        let (c, d, d_) = create_two_diagrams(true);

        let m: HashColumn<QualifiedName, (QualifiedName, QualifiedPath)> = HashColumn::new(
            [
                (name("j02"), (name("j_12"), Path::single(name("m12_02")))),
                (name("j00"), (name("j_10"), Path::single(name("m10_00")))),
            ]
            .into(),
        );
        let im = InstanceMorphism(&m, &d, &d_);
        assert!(im.validate_in(&c).is_ok());

        let m2: HashColumn<QualifiedName, (QualifiedName, QualifiedPath)> = HashColumn::new(
            [
                (name("j02"), (name("j_12"), Path::single(name("m12_02")))),
                (name("j00"), (name("j_12"), Path::pair(name("m12_11"), name("m11_00")))),
            ]
            .into(),
        );
        let im2 = InstanceMorphism(&m2, &d, &d_);

        assert!(im2.validate_in(&c).is_ok());

        assert!(im.equiv(&im2, &c));
    }
}
