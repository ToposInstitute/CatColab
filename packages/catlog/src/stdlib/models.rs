//! Standard library of models of double theories.

use std::rc::Rc;

use crate::dbl::{model::*, theory::*};
use crate::one::{Path, QualifiedPath};
use crate::zero::{name, QualifiedName};

/// The positive self-loop.
///
/// A signed graph or free [signed category](super::theories::th_signed_category),
/// possibly with delays or indeterminates.
pub fn positive_loop(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    loop_of_type(th, name("Object"), Path::Id(name("Object")))
}

/// The negative self-loop.
///
/// A signed graph or free [signed category](super::theories::th_signed_category),
/// possibly with delays or indeterminates.
pub fn negative_loop(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    loop_of_type(th, name("Object"), name("Negative").into())
}

/// The delayed positive self-loop.
///
/// A free [delayable signed category](super::theories::th_delayable_signed_category).
pub fn delayed_positive_loop(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    loop_of_type(th, name("Object"), name("Slow").into())
}

/// The delayed negative self-loop.
///
/// A free [delayable signed category](super::theories::th_delayable_signed_category).
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

/// The positive feedback loop between two objects.
///
/// A signed graph or free [signed category](super::theories::th_signed_category).
pub fn positive_feedback(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    let mut model = DiscreteDblModel::new(th);
    model.add_ob(name("x"), name("Object"));
    model.add_ob(name("y"), name("Object"));
    model.add_mor(name("positive1"), name("x"), name("y"), Path::Id(name("Object")));
    model.add_mor(name("positive2"), name("y"), name("x"), Path::Id(name("Object")));
    model
}

/// The negative feedback loop between two objects.
///
/// A signed graph or free [signed category](super::theories::th_signed_category).
pub fn negative_feedback(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    let mut model = DiscreteDblModel::new(th);
    model.add_ob(name("x"), name("Object"));
    model.add_ob(name("y"), name("Object"));
    model.add_mor(name("positive"), name("x"), name("y"), Path::Id(name("Object")));
    model.add_mor(name("negative"), name("y"), name("x"), name("Negative").into());
    model
}

/// The "walking attribute" schema.
///
/// A schema with one entity type, one attribute type, and one attribute.
pub fn walking_attr(th: Rc<DiscreteDblTheory>) -> DiscreteDblModel {
    let mut model = DiscreteDblModel::new(th);
    model.add_ob(name("entity"), name("Entity"));
    model.add_ob(name("type"), name("AttrType"));
    model.add_mor(name("attr"), name("entity"), name("type"), name("Attr").into());
    model
}

/// The "walking" backward link.
///
/// This is the free category with links that has a link from the codomain of a
/// morphism back to the morphism itself.
///
/// In system dynamics jargon, a backward link defines a "reinforcing loop,"
/// assuming the link has a positive effect on the flow. An example is an
/// infection flow an infectious disease model, where increasing the number of
/// infectives increases the rate of infection of the remaining susceptibles
/// (other things equal).
pub fn backward_link(th: Rc<DiscreteTabTheory>) -> DiscreteTabModel {
    backward_link_of_type(th, TabMorType::Basic(name("Link")))
}

/// The "walking" backward positive link.
///
/// This is the free category with signed links that has a positive link from
/// the codomain of a morphism back to the morphism itself.
pub fn positive_backward_link(th: Rc<DiscreteTabTheory>) -> DiscreteTabModel {
    // The type for positive links is just `Link`.
    backward_link_of_type(th, TabMorType::Basic(name("Link")))
}

/// The "walking" backward negative link.
///
/// This is the free category with signed links that has a negative link from
/// the codomain of a morphism back to the morphism itself.
pub fn negative_backward_link(th: Rc<DiscreteTabTheory>) -> DiscreteTabModel {
    backward_link_of_type(th, TabMorType::Basic(name("NegativeLink")))
}

fn backward_link_of_type(th: Rc<DiscreteTabTheory>, link_type: TabMorType) -> DiscreteTabModel {
    let ob_type = TabObType::Basic(name("Object"));
    let mut model = DiscreteTabModel::new(th.clone());
    model.add_ob(name("x"), ob_type.clone());
    model.add_ob(name("y"), ob_type.clone());
    model.add_mor(name("f"), name("x").into(), name("y").into(), th.hom_type(ob_type));
    model.add_mor(name("link"), name("y").into(), model.tabulated_gen(name("f")), link_type);
    model
}

/// A reaction involving three species, one playing the role of a catalyst.
///
/// A free symmetric monoidal category, viewed as a reaction network.
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

/// The SIR model viewed as a reaction network.
pub fn sir_petri(th: Rc<ModalDblTheory>) -> ModalDblModel {
    let (ob_type, op) = (ModalObType::new(name("Object")), name("tensor"));
    let mut model = ModalDblModel::new(th);
    let (s, i, r) = (name("S"), name("I"), name("R"));
    model.add_ob(s.clone(), ob_type.clone());
    model.add_ob(i.clone(), ob_type.clone());
    model.add_ob(r.clone(), ob_type.clone());
    model.add_mor(
        name("infect"),
        ModalOb::App(
            ModalOb::List(List::Symmetric, vec![s.into(), i.clone().into()]).into(),
            op.clone(),
        ),
        ModalOb::App(
            ModalOb::List(List::Symmetric, vec![i.clone().into(), i.clone().into()]).into(),
            op.clone(),
        ),
        ModalMorType::Zero(ob_type.clone()),
    );
    model.add_mor(name("recover"), i.into(), r.into(), ModalMorType::Zero(ob_type));
    model
}

pub fn dec(th: Rc<ModalDblTheory>) -> ModalDblModel {
    let ob_type = ModalObType::new(name("Object"));
    let mut model = ModalDblModel::new(th);
    let forms = vec![name("Form0"), name("Form1"), name("Form2")];
    for form in forms.clone() {
        model.add_ob(form, ob_type.clone());
    }

    let dualforms = vec![name("DualForm0"), name("DualForm1"), name("DualForm2")];
    for form in dualforms.clone() {
        model.add_ob(form, ob_type.clone());
    }

    for (dim, form) in forms.clone().into_iter().enumerate() {
        model.add_mor(
            name(format!("partial_{dim}").as_str()),
            ModalOb::Generator(form.clone()),
            ModalOb::Generator(form.clone()),
            ModalMorType::Zero(ob_type.clone()),
        );
        model.add_mor(
            name(format!("hodge_{dim}").as_str()),
            ModalOb::Generator(form.clone()),
            ModalOb::Generator(dualforms[3 - dim - 1].clone()),
            ModalMorType::Zero(ob_type.clone()),
        );

        if dim >= 2 {
            continue;
        }

        model.add_mor(
            name(format!("d_{dim}").as_str()),
            ModalOb::Generator(form.clone()),
            ModalOb::Generator(forms[dim + 1].clone()),
            ModalMorType::Zero(ob_type.clone()),
        );
    }

    let mor_type: ModalMorType = ModeApp::new(name("Multihom")).into();
    for (i, form1) in forms.iter().enumerate() {
        for (j, form2) in forms.iter().enumerate() {
            if !(i < j) || (i + j > 2) {
                continue;
            }
            model.add_mor(
                name(format!("wedge_{}", i + j).as_str()),
                ModalOb::List(List::Plain, vec![form1.clone().into(), form2.clone().into()]),
                forms[i + j].clone().into(),
                mor_type.clone(),
            );
        }
    }

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
    fn categories_with_signed_links() {
        let th = Rc::new(th_category_signed_links());
        assert!(positive_backward_link(th.clone()).validate().is_ok());
        assert!(negative_backward_link(th.clone()).validate().is_ok());
    }

    #[test]
    fn sym_monoidal_categories() {
        let th = Rc::new(th_sym_monoidal_category());
        assert!(catalyzed_reaction(th.clone()).validate().is_ok());
        assert!(sir_petri(th).validate().is_ok());
    }
}
