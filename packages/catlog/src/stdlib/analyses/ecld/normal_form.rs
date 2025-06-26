//! Transforming any ECLD into its "normal form", i.e. replacing length-n paths
//  with n length-1 paths.

use crate::dbl::model::{DiscreteDblModel, UstrDiscreteDblModel};
use crate::one::fp_category::UstrFpCategory;
use std::rc::Rc;

/** Given an ECLD, return a new ECLD of its normal form
 */
pub fn normal_form<Uuid>(_th: Rc<DiscreteDblModel<Uuid, UstrFpCategory>>) -> UstrDiscreteDblModel {
    panic!("oops");

    // DESIDERATA: this should return a enough information to be able to name
    //             the newly created objects in the derivative tower in the
    //             front end
}
