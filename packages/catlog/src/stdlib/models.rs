//! Standard library of models of double theories.

use std::sync::Arc;
use ustr::ustr;

use crate::dbl::model::*;
use crate::dbl::theory::UstrDiscreteDblTheory;
use crate::one::fin_category::FinHom;

/** The positive loop, a signed graph.

This model is a free [signed
category](crate::stdlib::theories::th_signed_category).
 */
pub fn positive_loop(th: Arc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let x = ustr("object");
    model.add_ob(x, ustr("Object"));
    model.add_mor(ustr("positive"), x, x, FinHom::Id(ustr("Object")));
    model
}

/** The negative loop, a signed graph.

This model is a free [signed
category](crate::stdlib::theories::th_signed_category).
 */
pub fn negative_loop(th: Arc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let x = ustr("object");
    model.add_ob(x, ustr("Object"));
    model.add_mor(ustr("negative"), x, x, FinHom::Generator(ustr("Negative")));
    model
}

#[cfg(test)]
mod tests {
    use super::super::theories::*;
    use super::*;
    use crate::validate::Validate;

    #[test]
    fn signed_categories() {
        let th = Arc::new(th_signed_category());
        assert!(positive_loop(th.clone()).validate().is_ok());
        assert!(negative_loop(th.clone()).validate().is_ok());
    }
}
