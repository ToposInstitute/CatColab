//! Unification of model-level object types.

use crate::mtt::{
    checker::{ObjectType, context::ModelEntry},
    theory::{Theory, UnificationResult},
};

impl<T: Theory> ModelEntry<T> {
    /// Unify a collection of model object types to their meet --- the single
    /// most specific object type they all refine to.
    ///
    /// Rigid object types unify structurally, while holes are wildcards whose
    /// recorded theory objects must remain compatible with the rigid result.
    /// An empty collection has no rigid demands, so its meet is a fresh hole.
    pub fn unify_object_types(
        &self,
        objects: &[&ObjectType<T>],
    ) -> UnificationResult<ObjectType<T>> {
        // Drop the holes while structurally unifying the rigid demands. We
        // check the theory-object information carried by the holes below.
        let rigid: Vec<&ObjectType<T>> = objects
            .iter()
            .copied()
            .filter(|o| match o {
                ObjectType::Generator(_)
                | ObjectType::List(_)
                | ObjectType::FunctionApplication { .. } => true,
                ObjectType::Hole { .. } => false,
            })
            .collect();

        let rigid_result = match rigid.split_first() {
            // With no rigid demands everything is still free. Unlike a theory
            // object hole, an object type hole records the theory object over
            // which it lies, so preserve the meet of that information.
            None => {
                let overs = objects
                    .iter()
                    .filter_map(|o| match o {
                        ObjectType::Generator(_)
                        | ObjectType::List(_)
                        | ObjectType::FunctionApplication { .. } => None,
                        ObjectType::Hole { over, .. } => Some(over),
                    })
                    .collect::<Vec<_>>();
                return T::unify_objects(&overs)
                    .map(|over| ObjectType::Hole { name: "unify".to_string(), over });
            }
            Some((first, rest)) => match first {
                // Generators unify iff they are all the very same generator.
                ObjectType::Generator(name) => {
                    if rest.iter().all(|o| match o {
                        ObjectType::Generator(other) => other == name,
                        ObjectType::List(_)
                        | ObjectType::FunctionApplication { .. }
                        | ObjectType::Hole { .. } => false,
                    }) {
                        (*first).clone()
                    } else {
                        return UnificationResult::Incompatible;
                    }
                }
                // Lists unify pointwise and must have the same length.
                ObjectType::List(items) => {
                    let mut columns: Vec<Vec<&ObjectType<T>>> =
                        items.iter().map(|item| vec![item]).collect();
                    for o in rest {
                        let ObjectType::List(other_items) = o else {
                            return UnificationResult::Incompatible;
                        };
                        if other_items.len() != columns.len() {
                            return UnificationResult::Incompatible;
                        }
                        for (column, item) in std::iter::zip(&mut columns, other_items) {
                            column.push(item);
                        }
                    }

                    let Some(items) = columns
                        .iter()
                        .map(|column| self.unify_object_types(column).most_specific())
                        .collect::<Option<Vec<_>>>()
                    else {
                        return UnificationResult::Incompatible;
                    };
                    ObjectType::List(items)
                }
                // Function applications unify when both their functions and
                // the object types to which they are applied unify.
                ObjectType::FunctionApplication { function, on } => {
                    let mut functions = vec![function];
                    let mut arguments = vec![on.as_ref()];
                    for o in rest {
                        let ObjectType::FunctionApplication {
                            function: other_function,
                            on: other_on,
                        } = o
                        else {
                            return UnificationResult::Incompatible;
                        };
                        functions.push(other_function);
                        arguments.push(other_on.as_ref());
                    }

                    let UnificationResult::MostSpecific(function) =
                        T::unify_vertical_arrows(&functions)
                    else {
                        return UnificationResult::Incompatible;
                    };
                    let UnificationResult::MostSpecific(on) = self.unify_object_types(&arguments)
                    else {
                        return UnificationResult::Incompatible;
                    };
                    ObjectType::FunctionApplication { function, on: Box::new(on) }
                }
                ObjectType::Hole { .. } => unreachable!("holes were already filtered"),
            },
        };

        // A model object type hole is only a wildcard within the fibre recorded
        // by `over`. Check those constraints against the rigid meet before
        // returning it.
        let hole_overs = objects
            .iter()
            .filter_map(|o| match o {
                ObjectType::Generator(_)
                | ObjectType::List(_)
                | ObjectType::FunctionApplication { .. } => None,
                ObjectType::Hole { over, .. } => Some(over),
            })
            .collect::<Vec<_>>();
        if !hole_overs.is_empty() {
            let Ok(rigid_over) = self.infer_theory_object(&rigid_result) else {
                return UnificationResult::Incompatible;
            };
            let mut overs = hole_overs;
            overs.push(&rigid_over);
            if !T::unify_objects(&overs).is_compatible() {
                return UnificationResult::Incompatible;
            }
        }

        UnificationResult::MostSpecific(rigid_result)
    }
}
