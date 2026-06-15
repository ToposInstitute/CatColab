use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    theory::{
        Boundary, ListVariant, ProArrowByBoundary, Theory, TheoryArrow, TheoryObject,
        TheoryProArrow,
    },
};

// TODO: check this whole file

/// The modal double theory of generalized (planar) multicategories: a single
/// object `𝕏` and a single pro-arrow `P: List 𝕏 -|-> 𝕏`. The list-monad
/// structure (μ/η) is carried by list manipulations on terms rather than
/// exposed as vertical arrows, so the checker only ever queries identity cells.
pub struct Multicategory;

const OBJECT: &str = "Object";
const P: &str = "P";

impl Multicategory {
    fn object() -> TheoryObject<Self> {
        TheoryObject::Generator(OBJECT.to_string())
    }

    fn list_of(o: &TheoryObject<Self>) -> TheoryObject<Self> {
        TheoryObject::ModalApplication {
            modality: ListVariant::Planar,
            on: Box::new(o.clone()),
        }
    }

    /// The generating pro-arrow `P: List 𝕏 -|-> 𝕏`.
    fn p_pro_arrow() -> TheoryProArrow<Self> {
        TheoryProArrow::Generator {
            name: P.to_string(),
            dom: Self::list_of(&Self::object()),
            cod: Self::object(),
        }
    }
}

impl Theory for Multicategory {
    fn name() -> String {
        "Multicategory".to_string()
    }

    fn list_modality() -> Option<ListVariant> {
        Some(ListVariant::Planar)
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

    fn generating_pro_arrow_by_name(name: &String) -> Option<TheoryProArrow<Self>> {
        (name == P).then(Self::p_pro_arrow)
    }

    fn pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self> {
        let base = Self::p_pro_arrow();
        if Self::unify_objects(&[dom, &base.dom()]).is_compatible()
            && Self::unify_objects(&[cod, &base.cod()]).is_compatible()
        {
            ProArrowByBoundary::Composite(Composite::singleton(base))
        } else if let Some(hom) = Self::make_hom_pro_arrow(dom, cod) {
            ProArrowByBoundary::Hom(hom)
        } else {
            ProArrowByBoundary::None
        }
    }

    fn has_object(obj: &TheoryObject<Self>) -> bool {
        // The objects are the modal tower over the single generator.
        match obj {
            TheoryObject::Generator(g) => g == OBJECT,
            TheoryObject::ModalApplication { modality, on } => {
                *modality == ListVariant::Planar && Self::has_object(on)
            }
            TheoryObject::Hole { .. } => true,
        }
    }

    fn has_theory_arrow(_arr: TheoryArrow<Self>) -> bool {
        false
    }

    fn has_pro_arrow(pro: &TheoryProArrow<Self>) -> bool {
        match pro {
            TheoryProArrow::Hom(o) => Self::has_object(o),
            // `P` at any modal depth: its domain is always the list of its
            // codomain.
            TheoryProArrow::Generator { name, dom, cod } => {
                *name == *P
                    && Self::has_object(cod)
                    && Self::unify_objects(&[dom, &Self::list_of(cod)]).is_compatible()
            }
            TheoryProArrow::Restriction { .. } | TheoryProArrow::Hole { .. } => false,
        }
    }

    fn has_cell(b: &Boundary<Self>) -> bool {
        // Only identity cells: μ/η never reach the checker, so verticals are
        // always identities and the pro-arrow boundaries must coincide.
        b.dom_vertical.is_empty()
            && b.cod_vertical.is_empty()
            && Self::unify_objects(&[&b.dom_dom_object, &b.cod_dom_object]).is_compatible()
            && Self::unify_objects(&[&b.dom_cod_object, &b.cod_cod_object]).is_compatible()
            && Self::unify_pro_arrows(&[&b.dom_proarrow, &b.cod_proarrow]).is_compatible()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `𝕏`, `List 𝕏`, `List List 𝕏` are all objects; the modal tower is closed.
    #[test]
    fn objects_are_the_modal_tower() {
        let x = Multicategory::object();
        let list_x = Multicategory::list_of(&x);
        let list_list_x = Multicategory::list_of(&list_x);
        assert!(Multicategory::has_object(&x));
        assert!(Multicategory::has_object(&list_x));
        assert!(Multicategory::has_object(&list_list_x));
    }

    /// `P` is valid at every modal depth; the hom on any object is valid; a
    /// malformed `P` is not.
    #[test]
    fn pro_arrows_at_every_depth() {
        let x = Multicategory::object();
        let list_x = Multicategory::list_of(&x);

        // P: List 𝕏 -|-> 𝕏
        assert!(Multicategory::has_pro_arrow(&Multicategory::p_pro_arrow()));
        // List P: List List 𝕏 -|-> List 𝕏
        assert!(Multicategory::has_pro_arrow(&TheoryProArrow::Generator {
            name: P.to_string(),
            dom: Multicategory::list_of(&list_x),
            cod: list_x.clone(),
        }));
        // Hom on List 𝕏
        assert!(Multicategory::has_pro_arrow(&TheoryProArrow::Hom(list_x.clone())));
        // A `P` whose domain is not the list of its codomain is invalid.
        assert!(!Multicategory::has_pro_arrow(&TheoryProArrow::Generator {
            name: P.to_string(),
            dom: x.clone(),
            cod: x.clone(),
        }));
    }

    /// `P` fills its base boundary; the self-boundary is filled by hom; `μ`/`η`
    /// are not arrows.
    #[test]
    fn boundary_and_arrow_lookup() {
        let x = Multicategory::object();
        let list_x = Multicategory::list_of(&x);
        match Multicategory::pro_arrow_by_boundary(&list_x, &x) {
            ProArrowByBoundary::Composite(c) => match c.only() {
                Some(TheoryProArrow::Generator { name, .. }) => assert_eq!(name, P),
                _ => panic!("`P` should fill its base boundary as a single generator"),
            },
            _ => panic!("`P` should fill its base boundary"),
        }
        assert!(matches!(
            Multicategory::pro_arrow_by_boundary(&x, &x),
            ProArrowByBoundary::Hom(_)
        ));
        assert!(Multicategory::generating_arrow_by_name(&"mu".to_string()).is_none());
    }
}
