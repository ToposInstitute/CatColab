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
use crate::one::{Path, UstrFpCategory, category::FgCategory};
use crate::stdlib::theories;
use std::{cmp::Eq, collections::HashMap, hash::Hash, rc::Rc};
use ustr::ustr;
use uuid::Uuid;

// Some helpful functions
fn deg_of_mor<Id>(model: &DiscreteDblModel<Id, UstrFpCategory>, f: &Id) -> usize
where
    Id: Clone + Hash + Eq,
{
    model.mor_generator_type(f).into_iter().filter(|t| *t == ustr("Degree")).count()
}

// TODO: filter -> find, don't need to do mod 2?
fn is_mor_pos<Id>(model: &DiscreteDblModel<Id, UstrFpCategory>, f: &Id) -> bool
where
    Id: Clone + Hash + Eq,
{
    0 == model
        .mor_generator_type(f)
        .into_iter()
        .filter(|t| *t == ustr("Negative"))
        .count()
        % 2
}

// TODO: do we need an Rc here?
/** Atomisiation of an ECLD by degree: replace every degree-n arrow by a path
 * of n-many degree-1 arrows, going via (n-1)-many new objects; all the
 * degree-0 arrows are kept unchanged. Returns the derivative towers to keep
 * track of the relation between the formal derivatives and the original objects
 */
pub fn degree_atomisation(
    model: Rc<DiscreteDblModel<Uuid, UstrFpCategory>>,
) -> (DiscreteDblModel<Uuid, UstrFpCategory>, HashMap<Uuid, Vec<Uuid>>) {
    let mut atomised_model: DiscreteDblModel<Uuid, UstrFpCategory> =
        DiscreteDblModel::new(Rc::new(theories::th_deg_del_signed_category()));

    // There are some hash maps that will be useful throughout this algorithm:
    // tower_heights: [base object: height of its tower]
    let mut tower_heights: HashMap<Uuid, usize> = HashMap::new();
    // in_arrows_pos_deg: [object: [positive-degree arrows with object as codomain]]
    let mut in_arrows_pos_deg: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    // in_arrows_pos_deg: [object: [zero-degree arrows with object as codomain]]
    let mut in_arrows_zero_deg: HashMap<Uuid, Vec<Uuid>> = HashMap::new();

    // Every tower will be of height at least 1, and will have at the very least
    // an empty list of positive-degree (resp. zero-degree) incoming arrows
    for x in model.ob_generators() {
        tower_heights.insert(x, 1);
        in_arrows_pos_deg.insert(x, Vec::new());
        in_arrows_zero_deg.insert(x, Vec::new());
    }

    // -------------------------------------------------------------------------
    // 1.   For each base, calculate the maximum degree over all incoming
    //      arrows. Note that this is most easily done by actually iterating
    //      over the *morphisms* instead.

    for f in model.mor_generators() {
        let f_cod = model.get_cod(&f).unwrap();
        let f_degree = deg_of_mor(&model, &f);

        if f_degree != 0 {
            let new_degree = std::cmp::max(*tower_heights.get(f_cod).unwrap(), f_degree);
            tower_heights.insert(*f_cod, new_degree);

            // Since we already have the codomain, we can add this to our
            // hash map of positive-degree incoming arrows
            in_arrows_pos_deg.get_mut(f_cod).unwrap().push(f);
        } else {
            in_arrows_zero_deg.get_mut(f_cod).unwrap().push(f);
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
    let mut unchecked_bases: Vec<Uuid> = model.ob_generators().collect::<Vec<_>>().clone();

    while !unchecked_bases.is_empty() {
        // Since heights will change as we go, we start by resorting the list
        unchecked_bases.sort_by(|x, y| {
            let height = |base| tower_heights.get(base).unwrap();
            // Sort from smallest to largest so that we can pop from this stack
            height(y).cmp(height(x))
        });

        // Work on the base of (any one of) the tallest tower(s)
        let target = unchecked_bases.pop().unwrap();

        // Ensure that every incoming arrow can be lifted high enough in the
        // tower over its source
        for f in in_arrows_pos_deg.get(&target).unwrap() {
            let source = model.get_dom(f).unwrap();
            let source_height = *tower_heights.get(source).unwrap();
            let req_height = tower_heights.get(&target).unwrap() - deg_of_mor(&model, f) + 1;

            if req_height > source_height {
                tower_heights.insert(*source, req_height);
            }
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
    let mut towers: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    for (base, height) in tower_heights.iter_mut() {
        // Firstly, add the base object itself
        towers.insert(*base, vec![*base]);
        atomised_model.add_ob(*base, ustr("Object"));
        // Then add all the formal derivatives Y_i, along with the morphisms
        // Y_i -> Y_{i-1}
        for _i in 1..*height {
            let formal_der_i = Uuid::now_v7();
            atomised_model.add_ob(formal_der_i, ustr("Object"));
            let &formal_der_i_minus_1 = towers.get(base).unwrap().last().unwrap();
            atomised_model.add_mor(
                Uuid::now_v7(),
                formal_der_i,
                formal_der_i_minus_1,
                ustr("Degree").into(),
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
        for f in in_arrows_pos_deg.get(base).unwrap() {
            let deg = deg_of_mor(&model, f);
            let source = model.get_dom(f).unwrap();
            let source_tower = towers.get(source).unwrap();
            // Note that we could alternatively take height to be the length of
            // towers.get(source), which will be equal by construction
            let height = tower_heights.get(base).unwrap();
            let new_source = source_tower[height - deg];
            let &new_target = tower.last().unwrap();
            match is_mor_pos(&model, f) {
                true => atomised_model.add_mor(*f, new_source, new_target, ustr("Degree").into()),
                false => atomised_model.add_mor(
                    *f,
                    new_source,
                    new_target,
                    Path::pair(ustr("Negative"), ustr("Degree")),
                ),
            }
        }

        for f in in_arrows_zero_deg.get(base).unwrap() {
            atomised_model.add_mor(
                *f,
                *model.get_dom(f).unwrap(),
                *model.get_cod(f).unwrap(),
                Path::Id(ustr("Object")),
            );
        }
    }
    (atomised_model, towers)
}

#[cfg(test)]
mod tests {
    use super::degree_atomisation;
    use crate::dbl::discrete::model::UstrDiscreteDblModel;
    use crate::dbl::model::{DblModel, DiscreteDblModel, FgDblModel, MutDblModel};
    use crate::one::UstrFpCategory;
    use crate::one::category::FgCategory;
    use crate::stdlib::models::sample_ecld;
    use std::{collections::HashMap, rc::Rc};
    use ustr::ustr;
    use uuid::Uuid;

    /// creates a fresh UUID
    fn fresh() -> Uuid {
        Uuid::now_v7()
    }

    /** UUIDify a Ustr model to allow testing with UUID analyses

    This should probably be removed once/if identity types change in CatColab
     */
    fn uuidify(
        model: &UstrDiscreteDblModel,
    ) -> (DiscreteDblModel<Uuid, UstrFpCategory>, HashMap<ustr::Ustr, Uuid>) {
        let mut id_map: HashMap<ustr::Ustr, Uuid> = HashMap::new();
        let mut uuid_model: DiscreteDblModel<Uuid, UstrFpCategory> =
            DiscreteDblModel::new(model.theory_rc());
        for x in model.ob_generators() {
            let uuid_x = fresh();
            let ob_type = model.ob_type(&x);
            uuid_model.add_ob(uuid_x, ob_type);
            id_map.insert(x, uuid_x);
        }
        for f in model.mor_generators() {
            let uuid_f = fresh();
            let mor_type = model.mor_generator_type(&f);
            let uuid_dom = id_map.get(model.get_dom(&f).unwrap()).unwrap();
            let uuid_cod = id_map.get(model.get_cod(&f).unwrap()).unwrap();
            uuid_model.add_mor(uuid_f, *uuid_dom, *uuid_cod, mor_type);
            id_map.insert(f, uuid_f);
        }
        (uuid_model, id_map)
    }

    /// makes a hash map from objects in  the ustr model to tower heights
    fn correct_heights() -> HashMap<ustr::Ustr, usize> {
        let mut heights = HashMap::new();
        heights.insert(ustr("a"), 1);
        heights.insert(ustr("b"), 3);
        heights.insert(ustr("c"), 3);
        heights.insert(ustr("d"), 2);
        heights
    }

    /** makes a hash map from mor's in the ustr model to the correct index of
     * the domain in the atomised tower
     */
    fn correct_domain_indices() -> HashMap<ustr::Ustr, usize> {
        let mut domains = HashMap::new();
        domains.insert(ustr("f"), 0);
        domains.insert(ustr("g"), 2);
        domains.insert(ustr("l"), 0);
        domains
    }

    #[test]
    fn ecld_atomisation_test_tower_heights() {
        let ustr_model = &sample_ecld();
        let correct_heights = correct_heights();
        let (base_model, id_map) = uuidify(ustr_model);
        let (atomised_model, towers) = degree_atomisation(Rc::new(base_model));
        for x in ustr_model.ob_generators() {
            let height_at_x = towers.get(id_map.get(&x).unwrap()).unwrap().len();
            let correct_height = correct_heights.get(&x).unwrap();
            assert_eq!(height_at_x, *correct_height);
        }
        let correct_domain_indices = correct_domain_indices();
        for f in correct_domain_indices.keys() {
            let uuid_f = id_map.get(f).unwrap();
            let atomised_dom = atomised_model.get_dom(uuid_f).unwrap();
            let atomised_cod = atomised_model.get_cod(uuid_f).unwrap();
            let base_dom = ustr_model.get_dom(f).unwrap();
            let base_cod = ustr_model.get_cod(f).unwrap();
            let dom_index = *correct_domain_indices.get(f).unwrap();
            let cod_index = *correct_heights.get(base_cod).unwrap() - 1;
            let correct_dom = towers.get(id_map.get(base_dom).unwrap()).unwrap()[dom_index];
            let correct_cod = towers.get(id_map.get(base_cod).unwrap()).unwrap()[cod_index];
            assert_eq!(*atomised_dom, correct_dom, "Morphism {} has the wrong domain", *f);
            assert_eq!(*atomised_cod, correct_cod, "Morphism {} has the wrong codomain", *f);
        }
    }
}
