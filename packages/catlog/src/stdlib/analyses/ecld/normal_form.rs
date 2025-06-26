//! Transforming any ECLD into its "normal form", i.e. replacing length-n paths
//  with n length-1 paths.

use crate::dbl::model::DiscreteDblModel;
use crate::one::fp_category::UstrFpCategory;
use std::rc::Rc;
use crate::dbl::model::UstrDiscreteDblModel;

/** Given an ECLD, return a new ECLD of its normal form
 */
pub fn normal_form<Uuid>(_th: Rc<DiscreteDblModel<Uuid, UstrFpCategory>>) -> UstrDiscreteDblModel {
    panic!("oops");
}
