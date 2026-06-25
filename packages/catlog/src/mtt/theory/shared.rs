use itertools::Itertools;

use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    hole::Holy,
    theory::{ListVariant, Theory, TheoryArrow, TheoryObject, TheoryProArrow, UnificationResult},
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

        // TODO: check this.
        //
        // TODO: ModalCoherence unification. Two coherence maps unify iff their
        // depth pairs coincide: coh(m->n) = coh(m'->n') exactly when m == m'
        // and n == n'. The base object is fixed by the surrounding boundary, so
        // there is nothing further to unify here. When the depth pairs differ
        // the result is incompatible.
        TheoryArrow::ModalCoherence { from_depth, to_depth } => {
            if rest.iter().all(|a| {
                matches!(
                    a,
                    TheoryArrow::ModalCoherence { from_depth: f, to_depth: t }
                        if *f == *from_depth && *t == *to_depth
                )
            }) {
                UnificationResult::MostSpecific(TheoryArrow::ModalCoherence {
                    from_depth: *from_depth,
                    to_depth: *to_depth,
                })
            } else {
                UnificationResult::Incompatible
            }
        }
    }
}

/// Default unification algorithm for composites of pro-arrows. The equations
/// recognised by this algorithm are generated by the unitality of
/// [TheoryProArrow::Hom] and the compatibility of hom with modalities:
/// `M(Hom(X)) = Hom(M(X))`.
pub fn default_pro_arrow_composite_unify<T: Theory>(
    composites: &[&Composite<TheoryProArrow<T>>],
) -> UnificationResult<Composite<TheoryProArrow<T>>> {
    // With no composites there are no rigid demands, so the meet is the
    // most general pro-arrow: a singleton hole whose boundary is itself
    // unconstrained. This mirrors [structural_object_unification]'s handling
    // of an empty object collection, and lets the empty-list degenerate case
    // flow through the general element-unification path in synthesise_list.
    if composites.is_empty() {
        return UnificationResult::MostSpecific(Composite::singleton(
            TheoryProArrow::unconstrained("unify".to_string()),
        ));
    }

    let canonical_composites: Vec<Vec<_>> = composites
        .iter()
        .map(|c| c.iter().map(default_canonicalise_pro_arrow).collect())
        .collect();

    // Filter out homs after canonicalisation, because modal homs are unital too.
    let filt_composites: Vec<_> = canonical_composites
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

    // After canonicalisation and hom removal, there are no further equations
    // between composite positions.
    let Some(pro_arrows) = (0..filt_composites[0].len())
        .map(|i| {
            let col: Vec<_> = filt_composites.iter().map(|row| row[i]).collect();
            default_canonical_pro_arrow_unify(&col).most_specific()
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

/// Unify a collection of canonical atomic pro-arrows.
fn default_canonical_pro_arrow_unify<T: Theory>(
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

/// Put a pro-arrow in the default normal form, pushing modalities on homs onto
/// their object: `M(Hom(X))` becomes `Hom(M(X))`.
fn default_canonicalise_pro_arrow<T: Theory>(pro_arrow: &TheoryProArrow<T>) -> TheoryProArrow<T> {
    match pro_arrow {
        TheoryProArrow::Hom(_) | TheoryProArrow::Generator { .. } | TheoryProArrow::Hole { .. } => {
            pro_arrow.clone()
        }
        TheoryProArrow::Restriction { base, dom_leg, cod_leg } => TheoryProArrow::Restriction {
            base: Box::new(default_canonicalise_pro_arrow(base)),
            dom_leg: dom_leg.clone(),
            cod_leg: cod_leg.clone(),
        },
        TheoryProArrow::ModalApplication { modality, on } => {
            let on = default_canonicalise_pro_arrow(on);
            match on {
                TheoryProArrow::Hom(o) => TheoryProArrow::Hom(TheoryObject::ModalApplication {
                    modality: modality.clone(),
                    on: Box::new(o),
                }),
                TheoryProArrow::Generator { .. }
                | TheoryProArrow::Hole { .. }
                | TheoryProArrow::Restriction { .. }
                | TheoryProArrow::ModalApplication { .. } => TheoryProArrow::ModalApplication {
                    modality: modality.clone(),
                    on: Box::new(on),
                },
            }
        }
    }
}

fn unwrap_modal_theory_object<T: Theory>(
    obj: TheoryObject<T>,
    modality: &ListVariant,
) -> Option<TheoryObject<T>> {
    match obj {
        TheoryObject::ModalApplication { modality: m, on } if &m == modality => Some(*on),
        _ => None,
    }
}

/// Structural unification of a collection of atomic pro-arrows, after default
/// canonicalisation of modal homs.
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
            for p in rest {
                let TheoryProArrow::Generator { name: n, .. } = p else {
                    return UnificationResult::Incompatible;
                };
                if n != name {
                    return UnificationResult::Incompatible;
                }
            }
            UnificationResult::MostSpecific(TheoryProArrow::Generator {
                name: name.clone(),
                dom,
                cod,
            })
        }

        TheoryProArrow::Restriction { base, dom_leg, cod_leg } => {
            // TODO: when a restriction's legs include [TheoryArrow::ModalCoherence],
            // the default structural unification below will only recognise two
            // restrictions as equal when their legs unify structurally. It does
            // *not* apply the theory's restriction/composition axioms (such as
            // the multicategory composition axiom `List P ; P = P(μ, 1)`), so a
            // restricted pro-arrow and its expanded composite form will not
            // unify here. That axiom-awareness is the responsibility of
            // [Theory::cell_search], not this default unifier.
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
            let UnificationResult::MostSpecific(base) = default_canonical_pro_arrow_unify(&bases)
            else {
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

        TheoryProArrow::ModalApplication { modality, on } => {
            // The boundaries should be of the form "modality(dom)" and
            // "modality(cod)", so we "unwrap" the modality to obtain the dom
            // and cod objects so that we may recursively unify the "unwrapped"
            // pro-arrows.
            let Some(dom) = unwrap_modal_theory_object(dom, modality) else {
                return UnificationResult::Incompatible;
            };
            let Some(cod) = unwrap_modal_theory_object(cod, modality) else {
                return UnificationResult::Incompatible;
            };

            let mut unwrapped: Vec<&TheoryProArrow<T>> = vec![on.as_ref()];
            for p in rest {
                let TheoryProArrow::ModalApplication { modality: m, on } = p else {
                    return UnificationResult::Incompatible;
                };
                if m != modality {
                    return UnificationResult::Incompatible;
                }
                unwrapped.push(on.as_ref());
            }

            structural_pro_arrow_unification(&unwrapped, dom, cod).map(|result| {
                TheoryProArrow::ModalApplication {
                    modality: modality.clone(),
                    on: Box::new(result),
                }
            })
        }

        TheoryProArrow::Hole { .. } => unreachable!("holes were already filtered"),
    }
}
