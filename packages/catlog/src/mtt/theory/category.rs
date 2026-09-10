use crate::mtt::{
    composite::Composite,
    theory::{
        ProArrowByBoundary, Theory, TheoryObject, TheoryProArrow, list_modality::NoListModality,
    },
};

/// The theory of categories: a single object `Object`, whose pro-arrows are all
/// homs. No vertical arrows, no list modality.
pub struct Category;

const OBJECT: &str = "Object";

impl Theory for Category {
    const NAME: &'static str = "Category";

    type ListModality = NoListModality;

    fn generating_pro_arrow_by_name(_name: &str) -> Option<TheoryProArrow<Self>> {
        None
    }

    fn pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self> {
        match Self::make_hom_pro_arrow(dom, cod) {
            Some(hom) => ProArrowByBoundary::Determined(Composite::singleton(hom)),
            None => ProArrowByBoundary::None,
        }
    }

    fn has_object(obj: &TheoryObject<Self>) -> bool {
        let object = TheoryObject::Generator(OBJECT.to_string());
        Self::unify_objects(&[obj, &object]).is_compatible()
    }

    fn has_pro_arrow(pro: &TheoryProArrow<Self>) -> bool {
        matches!(pro, TheoryProArrow::Hom(o) if Self::has_object(o))
    }

    // The default `cell_search` handles this theory.
}
