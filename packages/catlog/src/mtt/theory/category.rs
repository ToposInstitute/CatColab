use crate::mtt::theory::{
    Boundary, ListVariant, ProArrowByBoundary, Theory, TheoryArrow, TheoryObject, TheoryProArrow,
};

// TODO: check this whole file

/// The theory of categories: a single object `Object`, whose pro-arrows are all
/// homs. No vertical arrows, no list modality.
pub struct Category;

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
        Self::unify_objects(&[obj_a, obj_b]).most_specific().map(TheoryProArrow::Hom)
    }

    fn generating_arrow_by_name(_name: &String) -> Option<TheoryArrow<Self>> {
        None
    }

    fn generating_pro_arrow_by_name(_name: &String) -> Option<TheoryProArrow<Self>> {
        None
    }

    fn pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self> {
        match Self::make_hom_pro_arrow(dom, cod) {
            Some(hom) => ProArrowByBoundary::Hom(hom),
            None => ProArrowByBoundary::None,
        }
    }

    fn has_object(obj: &TheoryObject<Self>) -> bool {
        let object = TheoryObject::Generator(OBJECT.to_string());
        Self::unify_objects(&[obj, &object]).is_compatible()
    }

    fn has_theory_arrow(_arr: TheoryArrow<Self>) -> bool {
        false
    }

    fn has_pro_arrow(pro: &TheoryProArrow<Self>) -> bool {
        matches!(pro, TheoryProArrow::Hom(o) if Self::has_object(o))
    }

    fn has_cell(b: &Boundary<Self>) -> bool {
        b.dom_vertical.is_empty()
            && b.cod_vertical.is_empty()
            && [&b.dom_dom_object, &b.dom_cod_object, &b.cod_dom_object, &b.cod_cod_object]
                .into_iter()
                .all(Self::has_object)
    }
}
