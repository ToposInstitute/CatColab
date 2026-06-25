use crate::mtt::composite::Composite;
use crate::mtt::theory::{
    Boundary, ListVariant, ProArrowByBoundary, Theory, TheoryArrow, TheoryObject, TheoryProArrow,
};

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
        // This accepts unit cells, and inlines the unitality equations of hom.
        b.dom_vertical.is_empty()
            && b.cod_vertical.is_empty()
            && !b.cod_proarrow.is_empty()
            && b.dom_proarrow.iter().all(Self::has_pro_arrow)
            && b.cod_proarrow.iter().all(Self::has_pro_arrow)
            && b.objects().into_iter().all(Self::has_object)
    }

    fn cell_search(
        top: &Composite<TheoryProArrow<Self>>,
        bottom: &Composite<TheoryProArrow<Self>>,
    ) -> Option<Boundary<Self>> {
        // TODO: check this.
        //
        // TODO: implement cell_search for the theory of categories. This theory
        // has no list modality and no generating arrows, so the only cells are
        // globular hom-cells; the search amounts to checking whether `top` and
        // `bottom` unify over a common boundary with identity verticals.
        let _ = (top, bottom);
        todo!("cell_search for Category")
    }
}
