//! TODO: doc string

use crate::mtt::{
    hole::Holy,
    theory::{Theory, TheoryObject, UnificationResult},
};

/// Unify a collection of theory objects to their meet --- the single most
/// specific object they all refine to.
///
/// A [TheoryObject] is a linear chain of modal applications terminating in a
/// generator or a hole, and a hole is a bare wildcard carrying no constraints.
/// So two objects are compatible iff one is a prefix-refinement of the other,
/// and when they are the meet is simply the deeper (more specific) chain.
pub fn default_unify_objects<T: Theory>(
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
        TheoryObject::ModalApplication { on } => {
            let mut children: Vec<&TheoryObject<T>> = vec![on.as_ref()];
            for o in rest {
                let TheoryObject::ModalApplication { on } = o else {
                    return UnificationResult::Incompatible;
                };
                children.push(on.as_ref());
            }
            match default_unify_objects(&children) {
                UnificationResult::MostSpecific(child) => {
                    UnificationResult::MostSpecific(TheoryObject::ModalApplication {
                        on: Box::new(child),
                    })
                }
                UnificationResult::Incompatible => UnificationResult::Incompatible,
            }
        }
        TheoryObject::Hole { .. } => unreachable!("holes were already filtered"),
    }
}
