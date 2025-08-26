//! Standard library of models of double theories.

use std::rc::Rc;

use crate::dbl::{model::*, theory::*};
use crate::one::{Path, QualifiedPath};
use crate::zero::{QualifiedName, name};

/** The positive self-loop.

A signed graph or free [signed category](super::theories::th_signed_category),
possibly with delays or indeterminates.
 */
pub fn positive_loop(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    loop_of_type(th, name("Object"), Path::Id(name("Object")))
}

/** The negative self-loop.

A signed graph or free [signed category](super::theories::th_signed_category),
possibly with delays or indeterminates.
 */
pub fn negative_loop(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    loop_of_type(th, name("Object"), name("Negative").into())
}

/** The delayed positive self-loop.

A free [delayable signed category](super::theories::th_delayable_signed_category).
 */
pub fn delayed_positive_loop(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    loop_of_type(th, name("Object"), name("Slow").into())
}

/** The delayed negative self-loop.

A free [delayable signed category](super::theories::th_delayable_signed_category).
 */
pub fn delayed_negative_loop(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    loop_of_type(th, name("Object"), Path::pair(name("Negative"), name("Slow")))
}

/// Creates a self-loop with given object and morphism types.
fn loop_of_type(
    th: Rc<DiscreteDblTheory>,
    ob_type: QualifiedName,
    mor_type: QualifiedPath,
) -> DiscreteDblModel {
    let mut model = DiscreteDblModel::new(th);
    model.add_ob(name("x"), ob_type);
    model.add_mor(name("loop"), name("x"), name("x"), mor_type);
    model
}

/** The positive feedback loop between two objects.

A signed graph or free [signed category](super::theories::th_signed_category).
 */
pub fn positive_feedback(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    let mut model = DiscreteDblModel::new(th);
    model.add_ob(name("x"), name("Object"));
    model.add_ob(name("y"), name("Object"));
    model.add_mor(name("positive1"), name("x"), name("y"), Path::Id(name("Object")));
    model.add_mor(name("positive2"), name("y"), name("x"), Path::Id(name("Object")));
    model
}

/** The negative feedback loop between two objects.

A signed graph or free [signed category](super::theories::th_signed_category).
 */
pub fn negative_feedback(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    let mut model = DiscreteDblModel::new(th);
    model.add_ob(name("x"), name("Object"));
    model.add_ob(name("y"), name("Object"));
    model.add_mor(name("positive"), name("x"), name("y"), Path::Id(name("Object")));
    model.add_mor(name("negative"), name("y"), name("x"), name("Negative").into());
    model
}

/** The "walking attribute" schema.

A schema with one entity type, one attribute type, and one attribute.
 */
pub fn walking_attr(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    let mut model = DiscreteDblModel::new(th);
    model.add_ob(name("entity"), name("Entity"));
    model.add_ob(name("type"), name("AttrType"));
    model.add_mor(name("attr"), name("entity"), name("type"), name("Attr").into());
    model
}

/** The "walking" backward link.

This is the free category with links that has a link from the codomain of a
morphism back to the morphism itself.

In system dynamics jargon, a backward link defines a "reinforcing loop,"
assuming the link has a positive effect on the flow. An example is an infection
flow in a model of an infectious disease, where increasing the number of
infectives increases the rate of infection of the remaining susceptibles (other
things equal).
 */
pub fn backward_link(th: Rc<DiscreteTabTheory>) -> DiscreteTabModel {
    let ob_type = TabObType::Basic(name("Object"));
    let mut model = DiscreteTabModel::new(th.clone());
    model.add_ob(name("x"), ob_type.clone());
    model.add_ob(name("y"), ob_type.clone());
    model.add_mor(name("f"), name("x").into(), name("y").into(), th.hom_type(ob_type));
    model.add_mor(
        name("link"),
        name("y").into(),
        model.tabulated_gen(name("f")),
        TabMorType::Basic(name("Link")),
    );
    model
}

/** A reaction involving three species, one playing the role of a catalyst.

A free symmetric monoidal category, viewed as a reaction network.
 */
pub fn catalyzed_reaction(th: Rc<ModalDblTheory>) -> ModalDblModel {
    let (ob_type, op) = (ModalObType::new(name("Object")), name("tensor"));
    let mut model = ModalDblModel::new(th);
    model.add_ob(name("x"), ob_type.clone());
    model.add_ob(name("y"), ob_type.clone());
    model.add_ob(name("c"), ob_type.clone());
    let [x, y, c] = [name("x"), name("y"), name("c")].map(ModalOb::from);
    model.add_mor(
        name("f"),
        ModalOb::App(ModalOb::List(List::Symmetric, vec![x, c.clone()]).into(), op.clone()),
        ModalOb::App(ModalOb::List(List::Symmetric, vec![y, c]).into(), op),
        ModalMorType::Zero(ob_type),
    );
    model
}

/** A small example of an ECLD to use for testing purposes

   0,+      0,+            2,-
┌───────┐ ┌───────┐       ╔═══╗
▼       │ │       ▼       ▼   ║
a        b        c       d   ║
║       ▲ ▲       ║       ║   ║
╚═══════╝ ╚═══════╝       ╚═══╝
   3,-      1,+
*/
pub fn sample_ecld() -> UstrDiscreteDblModel {
    use nonempty::nonempty;
    let th = super::theories::th_deg_del_signed_category();
    let mut model = UstrDiscreteDblModel::new(Rc::new(th).clone());
    let (a, b, c, d) = (ustr("a"), ustr("b"), ustr("c"), ustr("d"));
    let (f, g, h, k, l) = (ustr("f"), ustr("g"), ustr("h"), ustr("k"), ustr("l"));
    let ob_type = ustr("Object");
    for x in vec![a, b, c, d].into_iter() {
        model.add_ob(x, ob_type)
    }
    let neg = ustr("Negative");
    let deg = ustr("Degree");
    model.add_mor(f, a, b, Path::Seq(nonempty![neg, deg, deg, deg]));
    model.add_mor(g, c, b, Path::Seq(nonempty![deg]));
    model.add_mor(h, b, c, Path::Id(ob_type));
    model.add_mor(k, b, a, Path::Id(ob_type));
    model.add_mor(l, d, d, Path::Seq(nonempty![deg, deg, neg]));
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

    #[test]
    fn sym_monoidal_categories() {
        let th = Rc::new(th_sym_monoidal_category());
        assert!(catalyzed_reaction(th).validate().is_ok());
    }
}
