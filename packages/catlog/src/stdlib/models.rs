//! Standard library of models of double theories.

use std::rc::Rc;
use ustr::{Ustr, ustr};

use crate::dbl::{model::*, theory::*};
use crate::one::Path;

/** The positive self-loop.

A signed graph or free [signed category](super::theories::th_signed_category),
possibly with delays or indeterminates.
 */
pub fn positive_loop(th: Rc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    loop_of_type(th, ustr("Object"), Path::Id(ustr("Object")))
}

/** The negative self-loop.

A signed graph or free [signed category](super::theories::th_signed_category),
possibly with delays or indeterminates.
 */
pub fn negative_loop(th: Rc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    loop_of_type(th, ustr("Object"), ustr("Negative").into())
}

/** The delayed positive self-loop.

A free [delayable signed category](super::theories::th_delayable_signed_category).
 */
pub fn delayed_positive_loop(th: Rc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    loop_of_type(th, ustr("Object"), ustr("Slow").into())
}

/** The delayed negative self-loop.

A free [delayable signed category](super::theories::th_delayable_signed_category).
 */
pub fn delayed_negative_loop(th: Rc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    loop_of_type(th, ustr("Object"), Path::pair(ustr("Negative"), ustr("Slow")))
}

/// Creates a self-loop with given object and morphism types.
fn loop_of_type(
    th: Rc<UstrDiscreteDblTheory>,
    ob_type: Ustr,
    mor_type: Path<Ustr, Ustr>,
) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let x = ustr("x");
    model.add_ob(x, ob_type);
    model.add_mor(ustr("loop"), x, x, mor_type);
    model
}

/** The positive feedback loop between two objects.

A signed graph or free [signed category](super::theories::th_signed_category).
 */
pub fn positive_feedback(th: Rc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let (x, y) = (ustr("x"), ustr("y"));
    model.add_ob(x, ustr("Object"));
    model.add_ob(y, ustr("Object"));
    model.add_mor(ustr("positive1"), x, y, Path::Id(ustr("Object")));
    model.add_mor(ustr("positive2"), y, x, Path::Id(ustr("Object")));
    model
}

/** The negative feedback loop between two objects.

A signed graph or free [signed category](super::theories::th_signed_category).
 */
pub fn negative_feedback(th: Rc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let (x, y) = (ustr("x"), ustr("y"));
    model.add_ob(x, ustr("Object"));
    model.add_ob(y, ustr("Object"));
    model.add_mor(ustr("positive"), x, y, Path::Id(ustr("Object")));
    model.add_mor(ustr("negative"), y, x, ustr("Negative").into());
    model
}

/** The "walking attribute" schema.

A schema with one entity type, one attribute type, and one attribute.
 */
pub fn walking_attr(th: Rc<UstrDiscreteDblTheory>) -> UstrDiscreteDblModel {
    let mut model = UstrDiscreteDblModel::new(th);
    let (entity, attr_type) = (ustr("entity"), ustr("type"));
    model.add_ob(entity, ustr("Entity"));
    model.add_ob(attr_type, ustr("AttrType"));
    model.add_mor(ustr("attr"), entity, attr_type, ustr("Attr").into());
    model
}

/** The "walking" backward link.

The free category with links having a link from the codomain of a morphism back
to the morphism itself.

In the system dynamics jargon, a backward link defines a "reinforcing loop,"
assuming the link has a positive effect on the flow. An example is an infection
flow in a model of an infectious disease, where increasing the number of
infectives increases the rate of infection of the remaining susceptibles (other
things equal).
 */
pub fn backward_link(th: Rc<UstrDiscreteTabTheory>) -> UstrDiscreteTabModel {
    let mut model = UstrDiscreteTabModel::new(th.clone());
    let (x, y, f) = (ustr("x"), ustr("y"), ustr("f"));
    let ob_type = TabObType::Basic(ustr("Object"));
    model.add_ob(x, ob_type.clone());
    model.add_ob(y, ob_type.clone());
    model.add_mor(f, TabOb::Basic(x), TabOb::Basic(y), th.hom_type(ob_type));
    model.add_mor(
        ustr("link"),
        TabOb::Basic(y),
        model.tabulated_gen(f),
        TabMorType::Basic(ustr("Link")),
    );
    model
}

#[cfg(test)]
mod tests {
    use super::super::theories::*;
    use super::*;
    use crate::validate::Validate;

    #[test]
    fn signed_categories() {
        let th = Rc::new(th_signed_category());
        assert!(positive_loop(th.clone()).validate().is_ok());
        assert!(negative_loop(th.clone()).validate().is_ok());
        assert!(positive_feedback(th.clone()).validate().is_ok());
        assert!(negative_feedback(th.clone()).validate().is_ok());
    }

    #[test]
    fn delayable_signed_categories() {
        let th = Rc::new(th_delayable_signed_category());
        assert!(positive_loop(th.clone()).validate().is_ok());
        assert!(negative_loop(th.clone()).validate().is_ok());
        assert!(delayed_positive_loop(th.clone()).validate().is_ok());
        assert!(delayed_negative_loop(th.clone()).validate().is_ok());
    }

    #[test]
    fn schemas() {
        let th = Rc::new(th_schema());
        assert!(walking_attr(th).validate().is_ok());
    }

    #[test]
    fn categories_with_links() {
        let th = Rc::new(th_category_links());
        assert!(backward_link(th).validate().is_ok());
    }
}
