use crate::mtt::{
    composite::Composite,
    theory::{
        Theory,
        core_types::{TheoryObject, TheoryProArrow},
    },
};

/// The name used for the canonical hom (identity) pro-arrow on an object.
pub const HOM: &str = "Hom";

/// Construct the hom pro-arrow on a pair of objects, used by the various
/// `make_hom_pro_arrow` implementations. The caller is responsible for having
/// already decided that `dom` and `cod` ought to coincide.
pub fn hom_pro_arrow<T: Theory>(dom: &TheoryObject<T>, cod: &TheoryObject<T>) -> TheoryProArrow<T> {
    TheoryProArrow::from(HOM.to_string(), dom.clone(), cod.clone())
}

/// Decide whether two pro-arrow composites are equal up to object unification,
/// used to recognise identity cell boundaries in discrete theories.
pub fn pro_arrow_composites_match<T: Theory>(
    lhs: &Composite<TheoryProArrow<T>>,
    rhs: &Composite<TheoryProArrow<T>>,
) -> bool {
    let lhs: Vec<_> = lhs.iter().collect();
    let rhs: Vec<_> = rhs.iter().collect();
    lhs.len() == rhs.len()
        && std::iter::zip(lhs, rhs).all(|(l, r)| {
            l.name == r.name
                && T::objects_unify(&[&l.dom, &r.dom])
                && T::objects_unify(&[&l.cod, &r.cod])
        })
}
