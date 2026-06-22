use itertools::Itertools;

use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    hole::Holy,
    theory::{Theory, TheoryArrow, TheoryObject, TheoryProArrow, UnificationResult},
};

/// Unify a collection of theory objects to their meet --- the single most
/// specific object they all refine to.
///
/// A [TheoryObject] is a linear chain of modal applications terminating in a
/// generator or a hole, and a hole is a bare wildcard carrying no constraints.
/// So two objects are compatible iff one is a prefix-refinement of the other,
/// and when they are the meet is simply the deeper (more specific) chain.
pub fn structural_object_unification<T: Theory>(
    objects: &[&TheoryObject<T>],
) -> UnificationResult<TheoryObject<T>> {
    // Drop the holes, which are bare wildcards, leaving only the rigid
    // demands that must all coincide.
    let rigid: Vec<&TheoryObject<T>> = objects
        .iter()
        .copied()
        .filter(|o| !matches!(o, TheoryObject::Hole { .. }))
        .collect();

    // With no rigid demands everything is still free, so the meet is a fresh
    // hole that any later observation may refine.
    let Some((first, rest)) = rigid.split_first() else {
        return UnificationResult::MostSpecific(TheoryObject::unconstrained("unify".to_string()));
    };

    match first {
        // Generators unify iff they are all the very same generator, in which
        // case the meet is that generator.
        TheoryObject::Generator(name) => {
            if rest
                .iter()
                .all(|o| matches!(o, TheoryObject::Generator(other) if other == name))
            {
                UnificationResult::MostSpecific((*first).clone())
            } else {
                UnificationResult::Incompatible
            }
        }
        // Modal applications unify iff they share a modality and their children
        // unify simultaneously (again unbiased); the meet re-wraps the
        // children's meet under that modality.
        TheoryObject::ModalApplication { modality, on } => {
            let mut children: Vec<&TheoryObject<T>> = vec![on.as_ref()];
            for o in rest {
                let TheoryObject::ModalApplication { modality: m, on } = o else {
                    return UnificationResult::Incompatible;
                };
                if m != modality {
                    return UnificationResult::Incompatible;
                }
                children.push(on.as_ref());
            }
            match structural_object_unification(&children) {
                UnificationResult::MostSpecific(child) => {
                    UnificationResult::MostSpecific(TheoryObject::ModalApplication {
                        modality: modality.clone(),
                        on: Box::new(child),
                    })
                }
                UnificationResult::Incompatible => UnificationResult::Incompatible,
            }
        }
        TheoryObject::Hole { .. } => unreachable!("holes were already filtered"),
    }
}

/// Default unification of a collection of vertical [TheoryArrow]s to their
/// meet, in the absence of any equations on these arrows. Similar logic to
/// [structural_object_unification].
pub fn default_arrow_unify<T: Theory>(
    arrows: &[&TheoryArrow<T>],
) -> UnificationResult<TheoryArrow<T>> {
    let Some((first, rest)) = arrows.split_first() else {
        return UnificationResult::Incompatible;
    };
    match first {
        TheoryArrow::Generator { name, dom, cod } => {
            let mut doms: Vec<&TheoryObject<T>> = vec![dom];
            let mut cods: Vec<&TheoryObject<T>> = vec![cod];
            for a in rest {
                let TheoryArrow::Generator { name: n, dom: d, cod: c } = a else {
                    return UnificationResult::Incompatible;
                };
                if n != name {
                    return UnificationResult::Incompatible;
                }
                doms.push(d);
                cods.push(c);
            }
            let UnificationResult::MostSpecific(dom) = T::unify_objects(&doms) else {
                return UnificationResult::Incompatible;
            };
            let UnificationResult::MostSpecific(cod) = T::unify_objects(&cods) else {
                return UnificationResult::Incompatible;
            };
            UnificationResult::MostSpecific(TheoryArrow::Generator { name: name.clone(), dom, cod })
        }

        TheoryArrow::ModalApplication { modality, on } => {
            let mut children: Vec<&TheoryArrow<T>> = vec![on.as_ref()];
            for a in rest {
                let TheoryArrow::ModalApplication { modality: m, on } = a else {
                    return UnificationResult::Incompatible;
                };
                if m != modality {
                    return UnificationResult::Incompatible;
                }
                children.push(on.as_ref());
            }
            default_arrow_unify(&children).map(|child| TheoryArrow::ModalApplication {
                modality: modality.clone(),
                on: Box::new(child),
            })
        }
    }
}

/// Default unification algorithm for composites of pro-arrows. The only
/// equations recognised by this algorithm are generated by the unitality of
/// [TheoryProArrow::Hom].
pub fn default_pro_arrow_composite_unify<T: Theory>(
    composites: &[&Composite<TheoryProArrow<T>>],
) -> UnificationResult<Composite<TheoryProArrow<T>>> {
    if composites.is_empty() {
        return UnificationResult::Incompatible;
    }
    // Filter out hom, they're unital
    let filt_composites: Vec<_> = composites
        .iter()
        .map(|c| c.iter().filter(|p| !matches!(p, TheoryProArrow::Hom(_))).collect::<Vec<_>>())
        .collect();

    // must all be the same length
    if !filt_composites.iter().map(Vec::len).all_equal() {
        return UnificationResult::Incompatible;
    }

    // if they're all empty now, we have a single hom if we can unify dom and cod
    if filt_composites[0].is_empty() {
        // It's a hom if the boundary is a single object, note that in general
        // this is stricter than first unifying domains & codomains separately,
        // before unifying the result.
        let boundary: Vec<_> = composites.iter().flat_map(|c| [c.dom(), c.cod()]).collect();
        let boundary_refs = &boundary.iter().collect::<Vec<_>>();
        return T::unify_objects(boundary_refs)
            .map(TheoryProArrow::Hom)
            .map(Composite::singleton);
    }

    // because we have no further equations we may unify these composites iff we
    // may unify across the composites position-for-position.
    let Some(pro_arrows) = (0..filt_composites[0].len())
        .map(|i| {
            let col: Vec<_> = filt_composites.iter().map(|row| row[i]).collect();
            default_pro_arrow_unify(&col).most_specific()
        })
        .collect::<Option<Vec<_>>>()
    else {
        return UnificationResult::Incompatible;
    };

    let Ok(result) = Composite::try_from(pro_arrows) else {
        // really this should be impossible if everything is law abiding
        return UnificationResult::Incompatible;
    };

    UnificationResult::MostSpecific(result)
}

/// Unify a collection of atomic pro-arrows.
fn default_pro_arrow_unify<T: Theory>(
    pro_arrows: &[&TheoryProArrow<T>],
) -> UnificationResult<TheoryProArrow<T>> {
    let doms = pro_arrows.iter().copied().map(TheoryProArrow::dom).collect::<Vec<_>>();
    let dom_refs = doms.iter().collect::<Vec<_>>();
    let UnificationResult::MostSpecific(dom) = T::unify_objects(&dom_refs) else {
        return UnificationResult::Incompatible;
    };

    let cods = pro_arrows.iter().copied().map(TheoryProArrow::cod).collect::<Vec<_>>();
    let cod_refs = cods.iter().collect::<Vec<_>>();
    let UnificationResult::MostSpecific(cod) = T::unify_objects(&cod_refs) else {
        return UnificationResult::Incompatible;
    };

    structural_pro_arrow_unification(pro_arrows, dom, cod)
}

/// Structural unification of a collection of atomic pro-arrows, under the sole
/// assumption that there are no non-hom equations. In particular then, we
/// choose to treat [TheoryProArrow::ModalApplication] as not unifying with
/// anything.
///
/// `dom` and `cod` are the already-unified boundary objects the result must
/// span (see [default_pro_arrow_unify]); they are needed because a pro-arrow's
/// most general inhabitants --- a hole, and the parametric hom --- carry no
/// structure of their own beyond that boundary.
///
/// The algorithm mirrors [structural_object_unification]: holes are bare
/// wildcards whose only content is their boundary; the remaining rigid
/// pro-arrows must all share a head, and we recurse on the remainder.
fn structural_pro_arrow_unification<T: Theory>(
    pro_arrows: &[&TheoryProArrow<T>],
    dom: TheoryObject<T>,
    cod: TheoryObject<T>,
) -> UnificationResult<TheoryProArrow<T>> {
    // we have dom & cod already, so don't need these
    let rigid: Vec<&TheoryProArrow<T>> =
        pro_arrows.iter().copied().filter(|p| !p.is_hole()).collect();

    // a hole is the most general solution in the case where we have no further
    // constraints
    let Some((first, rest)) = rigid.split_first() else {
        return UnificationResult::MostSpecific(TheoryProArrow::Hole {
            dom: dom.clone(),
            cod: cod.clone(),
        });
    };

    match first {
        TheoryProArrow::Hom(_) => {
            if rest.iter().any(|p| !matches!(p, TheoryProArrow::Hom(_))) {
                return UnificationResult::Incompatible;
            }
            T::unify_objects(&[&dom, &cod]).map(TheoryProArrow::Hom)
        }

        TheoryProArrow::Generator { name, .. } => {
            if rest
                .iter()
                .any(|p| matches!(p, TheoryProArrow::Generator { name: n, .. } if n != name))
            {
                return UnificationResult::Incompatible;
            }
            UnificationResult::MostSpecific(TheoryProArrow::Generator {
                name: name.clone(),
                dom,
                cod,
            })
        }

        TheoryProArrow::Restriction { base, dom_leg, cod_leg } => {
            let mut bases: Vec<&TheoryProArrow<T>> = vec![base.as_ref()];
            let mut dom_legs: Vec<&TheoryArrow<T>> = vec![dom_leg];
            let mut cod_legs: Vec<&TheoryArrow<T>> = vec![cod_leg];
            for o in rest {
                let TheoryProArrow::Restriction { base: b, dom_leg: dl, cod_leg: cl } = o else {
                    return UnificationResult::Incompatible;
                };
                bases.push(b.as_ref());
                dom_legs.push(dl);
                cod_legs.push(cl);
            }
            let UnificationResult::MostSpecific(base) = default_pro_arrow_unify(&bases) else {
                return UnificationResult::Incompatible;
            };
            let UnificationResult::MostSpecific(dom_leg) = default_arrow_unify(&dom_legs) else {
                return UnificationResult::Incompatible;
            };
            let UnificationResult::MostSpecific(cod_leg) = default_arrow_unify(&cod_legs) else {
                return UnificationResult::Incompatible;
            };
            UnificationResult::MostSpecific(TheoryProArrow::Restriction {
                base: Box::new(base),
                dom_leg,
                cod_leg,
            })
        }

        // Modal applications are intentionally unsupported here
        TheoryProArrow::ModalApplication { .. } => UnificationResult::Incompatible,

        TheoryProArrow::Hole { .. } => unreachable!("holes were already filtered"),
    }
}
