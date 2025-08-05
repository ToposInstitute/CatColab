/*! Atomisations for extended causal loop diagrams (ECLDs)

ECLDs have arrows labelled by two natural numbers, for degree and delay. In the
intended linear ODE semantics, both of these behave additively under composition
of paths. It is useful to have a rewrite rule that "atomises" any arrow, i.e.
replacing an arrow X -> Y of degree (say) d by d-many arrows of degree 1, thus
also introducing (d-1)-many new objects X -> Y1 -> Y2 -> ... -> Y(d-1) -> Y. The
idea to keep in mind is that a degree-n differential equation of the form
(d/dt)^n(Y) = X can equivalently be written as a system of degree-1 differential
equations, namely (d/dt)(Y) = Y1, (d/dt)(Y1) = Y2, ..., (d/dt)(Y(d-1)) = X.
 */

use crate::dbl::model::{DiscreteDblModel, UstrDiscreteDblModel};
use crate::one::fp_category::UstrFpCategory;
use std::rc::Rc;

/** Atomisiation of an ECLD by degree: replacing every degree-d arrow by a path
 * of d-many degree-1 arrows, going via (d-1)-many new objects (which we name
 * as though they were indeed all intermediate derivatives)
 */
pub fn degree_atomisation<Uuid>(_th: Rc<DiscreteDblModel<Uuid, UstrFpCategory>>) -> UstrDiscreteDblModel {
    panic!("oops");

    // DESIDERATA: this should return a enough information to be able to name
    //             the newly created objects in the derivative tower in the
    //             front end
}
