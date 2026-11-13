use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    theory::{
        AtomicFiller, ProArrowByBoundary, Theory, TheoryObject, TheoryProArrow,
        list_modality::NoListModality,
    },
};

/// The theory of database schemas with attributes.
pub struct Schema;

const ENTITY: &str = "Entity";
const ATTR_TYPE: &str = "AttrType";
const ATTR: &str = "Attr";

impl Schema {
    fn entity() -> TheoryObject<Self> {
        TheoryObject::Generator(ENTITY.to_string())
    }

    fn attr_type() -> TheoryObject<Self> {
        TheoryObject::Generator(ATTR_TYPE.to_string())
    }

    fn attr_pro_arrow() -> TheoryProArrow<Self> {
        TheoryProArrow::Generator {
            name: ATTR.to_string(),
            dom: Self::entity(),
            cod: Self::attr_type(),
        }
    }
}

impl Theory for Schema {
    const NAME: &'static str = "Schema";

    type ListModality = NoListModality;

    fn generating_pro_arrow_by_name(name: &str) -> Option<TheoryProArrow<Self>> {
        (name == ATTR).then(Self::attr_pro_arrow)
    }

    fn pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self> {
        let attr = (Self::unify_objects(&[dom, &Self::entity()]).is_compatible()
            && Self::unify_objects(&[cod, &Self::attr_type()]).is_compatible())
        .then(Self::attr_pro_arrow)
        .map(Composite::singleton)
        .map(ProArrowByBoundary::Determined);

        let hom = Self::make_hom_pro_arrow(dom, cod)
            .map(Composite::singleton)
            .map(ProArrowByBoundary::Determined);
        match (attr, hom) {
            (Some(result), None) => result,
            (None, Some(result)) => result,
            (None, None) => ProArrowByBoundary::None,
            _ => ProArrowByBoundary::Ambiguous,
        }
    }

    fn generating_pro_arrows_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self, AtomicFiller> {
        match Self::pro_arrow_by_boundary(dom, cod) {
            ProArrowByBoundary::Ambiguous => ProArrowByBoundary::Ambiguous,
            ProArrowByBoundary::None => ProArrowByBoundary::None,
            ProArrowByBoundary::Determined(a) => {
                ProArrowByBoundary::Determined(a.only().unwrap().clone())
            }
        }
    }

    fn has_object(obj: &TheoryObject<Self>) -> bool {
        let entity = TheoryObject::Generator(ENTITY.to_string());
        let attr_type = TheoryObject::Generator(ATTR_TYPE.to_string());

        Self::unify_objects(&[obj, &entity]).is_compatible()
            || Self::unify_objects(&[obj, &attr_type]).is_compatible()
    }

    fn has_pro_arrow(pro: &TheoryProArrow<Self>) -> bool {
        match pro {
            TheoryProArrow::Hom(o) => Self::has_object(o),
            TheoryProArrow::Generator { name, dom, cod } => {
                let attr = Self::attr_pro_arrow();
                *name == *ATTR
                    && Self::unify_objects(&[dom, &attr.dom()]).is_compatible()
                    && Self::unify_objects(&[cod, &attr.cod()]).is_compatible()
            }
            // Schema has no list modality, so modal pro-arrows are invalid.
            TheoryProArrow::ModalApplication(_)
            | TheoryProArrow::Restriction { .. }
            | TheoryProArrow::Hole { .. } => false,
        }
    }

    // The default `cell_search` handles this theory.
}
