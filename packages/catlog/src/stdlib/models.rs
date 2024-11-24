//! Standard library of models of double theories.

use std::sync::Arc;
use ustr::ustr;

use crate::dbl::model::*;
use crate::dbl::theory::UstrDiscreteDblTheory;
use crate::one::fin_category::FinMor;

/** The positive self-loop.

A signed graph or free [signed category](super::theories::th_signed_category).
 */
pub fn positive_loop(th: Arc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let x = ustr("x");
    model.add_ob(x, ustr("Object"));
    model.add_mor(ustr("positive"), x, x, FinMor::Id(ustr("Object")));
    model
}

/** The negative self-loop.

A signed graph or free [signed category](super::theories::th_signed_category).
 */
pub fn negative_loop(th: Arc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let x = ustr("x");
    model.add_ob(x, ustr("Object"));
    model.add_mor(ustr("negative"), x, x, FinMor::Generator(ustr("Negative")));
    model
}

/** The positive feedback loop between two objects.

A signed graph or free [signed category](super::theories::th_signed_category).
 */
pub fn positive_feedback(th: Arc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let (x, y) = (ustr("x"), ustr("y"));
    model.add_ob(x, ustr("Object"));
    model.add_ob(y, ustr("Object"));
    model.add_mor(ustr("positive1"), x, y, FinMor::Id(ustr("Object")));
    model.add_mor(ustr("positive2"), y, x, FinMor::Id(ustr("Object")));
    model
}

/** The negative feedback loop between two objects.

A signed graph or free [signed category](super::theories::th_signed_category).
 */
pub fn negative_feedback(th: Arc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let (x, y) = (ustr("x"), ustr("y"));
    model.add_ob(x, ustr("Object"));
    model.add_ob(y, ustr("Object"));
    model.add_mor(ustr("positive"), x, y, FinMor::Id(ustr("Object")));
    model.add_mor(ustr("negative"), y, x, FinMor::Generator(ustr("Negative")));
    model
}

/** The "walking attribute" schema.

A schema with one entity type, one attribute type, and one attribute.
 */
pub fn walking_attr(th: Arc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let (entity, attr_type) = (ustr("entity"), ustr("type"));
    model.add_ob(entity, ustr("Entity"));
    model.add_ob(attr_type, ustr("AttrType"));
    model.add_mor(ustr("attr"), entity, attr_type, FinMor::Generator(ustr("Attr")));
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
        assert!(positive_feedback(th.clone()).validate().is_ok());
        assert!(negative_feedback(th.clone()).validate().is_ok());
    }

    #[test]
    fn schemas() {
        let th = Arc::new(th_schema());
        assert!(walking_attr(th).validate().is_ok());
    }
}
