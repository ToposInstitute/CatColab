//! TO-DO: documentation

use crate::dbl::model::{DiscreteDblModel, UstrDiscreteDblModel};
use crate::one::fp_category::UstrFpCategory;
use std::rc::Rc;

/** TO-DO: documentation
 */
pub fn degree_atomisation<Uuid>(_th: Rc<DiscreteDblModel<Uuid, UstrFpCategory>>) -> UstrDiscreteDblModel {
    panic!("oops");

    // DESIDERATA: this should return a enough information to be able to name
    //             the newly created objects in the derivative tower in the
    //             front end
}
