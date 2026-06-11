use std::collections::HashSet;

use crate::mtt::{
    checker::{Boundary, TheoryGeneratingArrow, TheoryObject, TheoryProArrow},
    theory::{
        ListVariant, Theory,
        shared::{HOM, hom_pro_arrow},
    },
};

/// The theory of categories, aka the trivial (terminal) double theory. It is
/// degenerate in that it has a single object, `Object`, and a single pro-arrow,
/// the hom pro-arrow on that object: model pro-arrows are exactly the morphisms
/// of a category and all lie over `Hom`. There are no non-trivial vertical
/// arrows and no list modality.
pub struct Category;

/// The single generating object of the theory of categories.
const OBJECT: &str = "Object";

impl Theory for Category {
    fn name() -> String {
        "Category".to_string()
    }

    fn list_modality() -> Option<ListVariant> {
        None
    }

    fn make_hom_pro_arrow(
        obj_a: &TheoryObject<Self>,
        obj_b: &TheoryObject<Self>,
    ) -> Option<TheoryProArrow<Self>> {
        Self::objects_unify(&[obj_a, obj_b]).then(|| hom_pro_arrow(obj_a, obj_b))
    }

    fn lookup_generating_arrow(_name: &String) -> Option<TheoryGeneratingArrow<Self>> {
        None
    }

    fn lookup_generating_pro_arrow(_name: &String) -> Option<TheoryProArrow<Self>> {
        // The only pro-arrow is the parametric hom, which is not a named
        // generating pro-arrow and therefore cannot be looked up by name.
        None
    }

    fn generating_pro_arrow_by_boundary(
        _dom: &TheoryObject<Self>,
        _cod: &TheoryObject<Self>,
    ) -> HashSet<String> {
        // The only pro-arrow is the parametric hom, which is never reported by
        // this function.
        HashSet::new()
    }

    fn has_object(obj: &TheoryObject<Self>) -> bool {
        let object = TheoryObject::Generator(OBJECT.to_string());
        Self::objects_unify(&[obj, &object])
    }

    fn has_generating_arrow(_arr: TheoryGeneratingArrow<Self>) -> bool {
        false
    }

    fn has_pro_arrow(pro: &TheoryProArrow<Self>) -> bool {
        // The only pro-arrow is the hom pro-arrow on the single object.
        pro.name == HOM && Self::has_object(&pro.dom) && Self::has_object(&pro.cod)
    }

    fn has_cell(b: &Boundary<Self>) -> bool {
        b.dom_vertical.is_empty()
            && b.cod_vertical.is_empty()
            && [&b.dom_dom_object, &b.dom_cod_object, &b.cod_dom_object, &b.cod_cod_object]
                .into_iter()
                .all(Self::has_object)
    }
}
