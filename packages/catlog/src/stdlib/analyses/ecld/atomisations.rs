/*! Atomisations for extended causal loop diagrams (ECLDs)

ECLDs have arrows labelled by two natural numbers, for degree and delay. In the
intended linear ODE semantics, both of these behave additively under composition
of paths. It is useful to have a rewrite rule that "atomises" any arrow, i.e.
replacing an arrow X -> Y of degree n (which corresponds to the equation
(d/dt)^n(Y) += kX) by n-many arrows of degree 1, thus also introducing (n-1)-many
new objects X -> Y_{n-1} -> ... -> Y_2 -> Y_1 -> Y. The idea to keep in mind is
that a degree-n differential equation of the form (d/dt)^n(Y) = X can
equivalently be written as a system of degree-1 differential equations, namely
(d/dt)(Y) = Y_1, (d/dt)(Y_1) = Y_2, ..., (d/dt)(Y_{n-1}) = X. An analogous story
holds for order of delay, though this is formally dual: an arrow X -> Y of
order m corresponds to (something like) a morphism Y += k*E(m)*X, i.e. the
*source* is modified, not the target.

We call the objects Y_i the *formal derivatives* (resp. *formal delays*) of Y,
and the list [Y_0 = Y, Y_1, ..., Y_{n-1}] the *tower* over Y (resp. under Y),
and call Y the *base* of this tower; we call the length n of the list
[Y_0, ..., Y_{n-1}] the *height* of the tower.
 */

use crate::dbl::model::{DiscreteDblModel, FgDblModel, MutDblModel};
use crate::one::{Path, category::FgCategory};
use crate::stdlib::theories;
use crate::zero::{QualifiedName, name};
use std::{collections::HashMap, rc::Rc};

// Some helpful functions
fn deg_of_mor(model: &DiscreteDblModel, f: &QualifiedName) -> usize {
    model.mor_generator_type(f).into_iter().filter(|t| *t == name("Degree")).count()
}

fn is_mor_pos(model: &DiscreteDblModel, f: &QualifiedName) -> bool {
    0 == model
        .mor_generator_type(f)
        .into_iter()
        .filter(|t| *t == name("Negative"))
        .count()
        % 2
}

/** Atomisiation of an ECLD by degree: replace every degree-n arrow by a path
 * of n-many degree-1 arrows, going via (n-1)-many new objects; all the
 * degree-0 arrows are kept unchanged. Returns the derivative towers to keep
 * track of the relation between the formal derivatives and the original objects
 */
pub fn degree_atomisation(
    // TODO: do we really need an Rc here?
    model: Rc<DiscreteDblModel>,
) -> (DiscreteDblModel, HashMap<QualifiedName, Vec<QualifiedName>>) {
    let mut atomised_model: DiscreteDblModel =
        DiscreteDblModel::new(Rc::new(theories::th_deg_del_signed_category()));

    // height: the total height of the tower
    // in_arrows_pos_deg: all incoming arrows of (strictly) positive degree
    // in_arrows_zero_deg: all incoming arrows of zero degree
    struct TowerConstructor {
        height: usize,
        in_arrows_pos_deg: Vec<QualifiedName>,
        in_arrows_zero_deg: Vec<QualifiedName>,
    }
    let mut tower_constructors: HashMap<QualifiedName, TowerConstructor> = HashMap::new();

    // Every tower will be of height at least 1, and will have at the very least
    // an empty list of positive-degree (resp. zero-degree) incoming arrows
    for x in model.ob_generators() {
        tower_constructors.insert(
            x.clone(),
            TowerConstructor {
                height: 1,
                in_arrows_pos_deg: Vec::new(),
                in_arrows_zero_deg: Vec::new(),
            },
        );
    }

    // -------------------------------------------------------------------------
    // 1.   For each base, calculate the maximum degree over all incoming
    //      arrows. Note that this is most easily done by actually iterating
    //      over the *morphisms* instead.

    for f in model.mor_generators() {
        let f_cod = model.get_cod(&f).unwrap();
        let f_degree = deg_of_mor(&model, &f);

        if f_degree != 0 {
            let new_degree = std::cmp::max(tower_constructors.get(f_cod).unwrap().height, f_degree);
            tower_constructors
                .entry(f_cod.clone())
                .and_modify(|tower_cons| tower_cons.height = new_degree)
                // Since we already have the codomain, we can add this to our
                // hash map of positive-degree incoming arrows
                .and_modify(|tower_cons| tower_cons.in_arrows_pos_deg.push(f.clone()));
        } else {
            tower_constructors
                .entry(f_cod.clone())
                .and_modify(|tower_cons| tower_cons.in_arrows_zero_deg.push(f.clone()));
        }
    }

    // -------------------------------------------------------------------------
    // 2.   Iterate over all unchecked bases, starting with (any one of) the
    //      one(s) with greatest current height. For each one, ensure that all
    //      the incoming arrows can be lifted so that their target is the
    //      highest floor of the tower, i.e. that the tower over Y has enough
    //      floors so that *every* arrow into Y can have the same target Y_max.
    //      But note that if we lift an arrow of degree n from X to Y then we
    //      need to know that X_n exists, i.e. we need to (potentially) add
    //      more floors to the *source* of every arrow whose target is Y.

    // We have yet to build any of the towers so, right now, every base is
    // "unchecked".
    let mut unchecked_bases: Vec<QualifiedName> = model.ob_generators().collect::<Vec<_>>().clone();

    while !unchecked_bases.is_empty() {
        // Since heights will change as we go, we start by resorting the list
        unchecked_bases.sort_by(|x, y| {
            let height = |base| tower_constructors.get(base).unwrap().height;
            // Sort from smallest to largest so that we can pop from this stack
            height(y).cmp(&height(x))
        });

        // Work on the base of (any one of) the tallest tower(s)
        let target = unchecked_bases.pop().unwrap();

        // Ensure that every incoming arrow can be lifted high enough in the
        // tower over its source
        let target_in_arrows = &tower_constructors.get(&target).unwrap().in_arrows_pos_deg.clone();
        for f in target_in_arrows {
            let source = model.get_dom(f).unwrap();
            let required_height =
                tower_constructors.get(&target).unwrap().height - deg_of_mor(&model, f) + 1;
            tower_constructors.entry(source.clone()).and_modify(|tower_cons| {
                if tower_cons.height < required_height {
                    tower_cons.height = required_height
                }
            });
        }
    }

    // -------------------------------------------------------------------------
    // 3.   Now that we know the required height of all the towers, we can
    //      actually build them: create the formal derivatives and the morphisms
    //      between them, resulting in Y_{n-1} -> ... -> Y_1 -> Y. Once we have
    //      these, we add them to our final model, resulting in a "discrete"
    //      copy of our original model, where each object has been extruded out
    //      to a tower of formal derivatives, but where there are no arrows
    //      between distinct towers.

    // The hash map of towers will be useful when we later come to lifting all
    // positive-degree arrows, so we build this at the same time as adding all
    // these formal derivatives (and their morphisms) to the final model.
    let mut towers: HashMap<QualifiedName, Vec<QualifiedName>> = HashMap::new();

    for (base, tower_cons) in tower_constructors.iter_mut() {
        // Firstly, add the base object itself
        towers.insert(base.clone(), vec![base.clone()]);
        atomised_model.add_ob(base.clone(), name("Object"));
        // Then add all the formal derivatives Y_i, along with the morphisms
        // Y_i -> Y_{i-1}
        for i in 1..tower_cons.height {
            let suffix = format!("_d[{}]", i);
            let formal_der_i = base.clone().append(suffix.as_str().into());
            atomised_model.add_ob(formal_der_i.clone(), name("Object"));
            let formal_der_i_minus_1 = towers.get(base).unwrap().last().unwrap();
            atomised_model.add_mor(
                format!("d_({})^({})", base, i).as_str().into(),
                formal_der_i.clone(),
                formal_der_i_minus_1.clone(),
                name("Degree").into(),
            );
            towers.get_mut(base).unwrap().push(formal_der_i);
        }
    }

    // -------------------------------------------------------------------------
    // 4.   Finally, we add all the arrows from our original model into the new
    //      model:
    //      -   we lift all positive-degree morphisms to have their new
    //          target be the top floor of the tower over their old target (i.e.
    //          a degree-n arrow X -> Y corresponds to a degree-1 arrow
    //          X -> Y_{n-1}, which should then be lifted to a (degree-1) arrow
    //          X_{h - (n-1)} -> Y_h, where h is the height of the tower over Y)
    //      -   we simply copy over all the degree-zero morphisms.

    for (base, tower) in towers.iter() {
        let tower_cons = tower_constructors.get(base).unwrap();
        for f in &tower_cons.in_arrows_pos_deg {
            let deg = deg_of_mor(&model, f);
            let source = model.get_dom(f).unwrap();
            let source_tower = towers.get(source).unwrap();
            // Note that we could alternatively take height to be the length of
            // towers.get(source), which is equal by construction/definition
            let height = tower_cons.height;
            let new_source = &source_tower[height - deg];
            let new_target = tower.last().unwrap();
            match is_mor_pos(&model, f) {
                true => atomised_model.add_mor(
                    f.clone(),
                    new_source.clone(),
                    new_target.clone(),
                    name("Degree").into(),
                ),
                false => atomised_model.add_mor(
                    f.clone(),
                    new_source.clone(),
                    new_target.clone(),
                    Path::pair(name("Negative"), name("Degree")),
                ),
            }
        }

        for f in &tower_cons.in_arrows_zero_deg {
            atomised_model.add_mor(
                f.clone(),
                model.get_dom(f).unwrap().clone(),
                model.get_cod(f).unwrap().clone(),
                Path::Id(name("Object")),
            );
        }
    }
    (atomised_model, towers)
}

#[cfg(test)]
mod tests {
    use super::degree_atomisation;
    use crate::dbl::model::MutDblModel;
    use crate::one::category::FgCategory;
    use crate::stdlib::models::sample_ecld;
    use crate::zero::{QualifiedName, name};
    use std::{collections::HashMap, rc::Rc};

    // Makes a hash map from objects in sample_ecld to tower heights
    fn correct_heights() -> HashMap<QualifiedName, usize> {
        let mut heights = HashMap::new();
        heights.insert(name("a"), 1);
        heights.insert(name("b"), 3);
        heights.insert(name("c"), 3);
        heights.insert(name("d"), 2);
        heights
    }

    // Makes a hash map from morphisms in sample_ecld to the correct index of
    // the domain in the atomised tower
    fn correct_domain_indices() -> HashMap<QualifiedName, usize> {
        let mut domains = HashMap::new();
        domains.insert(name("f"), 0);
        domains.insert(name("g"), 2);
        domains.insert(name("l"), 0);
        domains
    }

    #[test]
    fn ecld_atomisation_test_tower_heights() {
        let model = &sample_ecld();
        let correct_heights = correct_heights();
        let (atomised_model, towers) = degree_atomisation(Rc::new(model.clone()));
        for x in model.ob_generators() {
            let height_at_x = towers.get(&x).unwrap().len();
            let correct_height = correct_heights.get(&x).unwrap();
            assert_eq!(
                height_at_x, *correct_height,
                "The tower over the object {} has the wrong height",
                x
            );
        }
        let correct_domain_indices = correct_domain_indices();
        for f in correct_domain_indices.keys() {
            let atomised_dom = atomised_model.get_dom(f).unwrap();
            let atomised_cod = atomised_model.get_cod(f).unwrap();
            let base_dom = model.get_dom(f).unwrap();
            let base_cod = model.get_cod(f).unwrap();
            let dom_index = *correct_domain_indices.get(f).unwrap();
            let cod_index = *correct_heights.get(base_cod).unwrap() - 1;
            let correct_dom = &towers.get(base_dom).unwrap()[dom_index].clone();
            let correct_cod = &towers.get(base_cod).unwrap()[cod_index].clone();
            assert_eq!(
                *atomised_dom,
                correct_dom.clone(),
                "The morphism {} has the wrong domain",
                *f
            );
            assert_eq!(
                *atomised_cod,
                correct_cod.clone(),
                "The morphism {} has the wrong codomain",
                *f
            );
        }
    }
}
