//! Transforming any ECLD into its "normal form", i.e. replacing length-n paths
//  with n length-1 paths.

use std::rc::Rc;
use crate::dbl::model::UstrDiscreteDblModel;
use crate::dbl::theory::*;

/** Given an ECLD, return a new ECLD of its normal form
 */
pub fn normal_form(th: Rc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let n_model = UstrDiscreteDblModel::new(th);
    n_model
}
