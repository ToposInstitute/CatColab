/*! Atomisations for extended causal loop diagrams (ECLDs)

ECLDs have arrows labelled by two natural numbers, for degree and delay. In the
intended linear ODE semantics, both of these behave additively under composition
of paths. It is useful to have a rewrite rule that "atomises" any arrow, i.e.
replacing an arrow X -> Y of degree (say) d by d-many arrows of degree 1, thus
also introducing d-many new objects X -> Y_1 -> Y_2 -> ... -> Y_d -> Y. The idea
to keep in mind is that a degree-n differential equation of the form
(d/dt)^n(Y) = X can equivalently be written as a system of degree-1 differential
equations, namely (d/dt)(Y) = Y_1, (d/dt)(Y_1) = Y_2, ..., (d/dt)(Y_{d-1}) = X.
An analogous story holds for order of delay.

We call the objects Y_i the *formal derivatives* (resp. *formal delays*) of Y,
and call the list [Y_0 = Y, Y_1, ..., Y_{d-1}] the *tower* over Y, and call Y
the *base* of this tower; we call the length d of the list [Y_0, ..., Y_{d-1}]
the *height* of the tower.
 */

use crate::dbl::model::{DiscreteDblModel, FgDblModel, MutDblModel, UstrDiscreteDblModel};
use crate::one::{UstrFpCategory, category::FgCategory};
use crate::stdlib::theories;
use std::{collections::HashMap, hash::Hash, rc::Rc};
use ustr::ustr;

// Some helpful functions
fn deg_of_mor<Uuid>(model: &DiscreteDblModel<Uuid, UstrFpCategory>, f: &Uuid) -> usize
where
    Uuid: Eq + Clone + Hash + Ord,
{
    model.mor_generator_type(f).into_iter().filter(|t| *t == ustr("Degree")).count()
}

fn sign_of_mor<Uuid>(model: &DiscreteDblModel<Uuid, UstrFpCategory>, f: &Uuid) -> usize
where
    Uuid: Eq + Clone + Hash + Ord,
{
    model
        .mor_generator_type(f)
        .into_iter()
        .filter(|t| *t == ustr("Negative"))
        .count()
        % 2
}

/** Atomisiation of an ECLD by degree: replace every degree-d arrow by a path
 * of d-many degree-1 arrows, going via (d-1)-many new objects; all the
 * degree-0 arrows are kept unchanged.
 */
pub fn degree_atomisation<Uuid>(
    model: Rc<DiscreteDblModel<Uuid, UstrFpCategory>>,
) -> UstrDiscreteDblModel
where
    Uuid: Eq + Clone + Hash + Ord + Copy,
{
    let mut atomised_model: UstrDiscreteDblModel =
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
        // TO-DO: should we actually be inserting &x here instead?
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
            // TO-DO: should we actually be pushing f? or instead a clone/deference?
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
    //      But note that if we lift an arrow of degree d from X to Y then we
    //      need to know that X_d exists, i.e. we need to (potentially) add
    //      more floors to the *source* of every arrow whose target is Y.

    // We have yet to build any of the towers so, right now, every base is
    // "unchecked".
    // TO-DO: should we really be using a clone here?
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
    //      between them, resulting in Y_d -> ... -> Y_1 -> Y. Once we have
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
        // TO-DO: fix atomised_model.add_ob
        // atomised_model.add_ob(*base, ustr("Object"));
        // Then add all the formal derivatives Y_i, along with the morphisms
        // Y_i -> Y_{i-1}
        for _i in 1..=*height {
            // let fder_i = fresh_uuid();
            // atomised_model.add_ob(x_i, ustr("Object"));
            // let &fder_i_minus_1 = towers.get(base).unwrap().last().unwrap();
            // TO-DO: is this right? all the new arrows should be degree 1, right???
            // atomised_model.add_mor(fresh_uuid(), fder_i, fder_i_minus_1, ustr("Degree"));
            // towers.get_mut(base).unwrap().push(fder_i);
        }
    }

    // -------------------------------------------------------------------------
    // 4.   Finally, we add all the arrows from our original model into the new
    //      model:
    //      -   we lift all positive-degree morphisms to have their new
    //          target be the top floor of the tower over their old target (i.e.
    //          a degree-d arrow X -> Y corresponds to a degree-1 arrow
    //          X -> Y_{d-1}, which should then be lifted to a (degree-1) arrow
    //          X_{h - (d-1)} -> Y_h, where h is the height of the tower over Y)
    //      -   we simply copy over all the degree-zero morphisms.

    for (base, tower) in towers.iter() {
        for f in in_arrows_pos_deg.get(base).unwrap() {
            let deg = deg_of_mor(&model, f);
            let source = model.get_dom(f).unwrap();
            let source_tower = towers.get(source).unwrap();
            // Note that we could alternatively take height to be the length of
            // towers.get(source), which will be equal by construction
            let height = tower_heights.get(base).unwrap();
            let new_source = source_tower[height - deg + 1];
            let &new_target = tower.last().unwrap();
            match sign_of_mor(&model, f) {
                // TO-DO: fix atomised_model.add_mor
                // TO-DO: again, should we be adding *f or a clone/dereference?
                // 0 => atomised_model.add_mor(*f, new_source, new_target, ustr("Degree").into()),
                // TO-DO: how do we create something of negative degree-1? ustr("Degree Negative")???
                // 1 => atomised_model.add_mor(*f, new_source, new_target, ustr("???"))
                // TO-DO: replace the following panic with something more sensible
                _ => panic!("Somehow an integer was found to be neither odd nor even"),
            }
        }

        for f in in_arrows_zero_deg.get(base).unwrap() {
            // TO-DO: fix atomised_model.add_mor
            // TO-DO: again, should we be adding *f or a clone/dereference?
            // atomised_model.add_mor(
            //     *f,
            //     *model.get_dom(f).unwrap(),
            //     *model.get_cod(f).unwrap(),
            //     Path::Id(ustr("Object")),
            // );
        }
    }

    // TO-DO: we should actually return enough information to be able to name
    //        the newly created objects in the derivative tower in the front end
    atomised_model
}

// TO-DO: add test for degree_atomisation using catlog::src::stdlib::models::sample_ecld
