use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    theory::{
        Boundary, ListVariant, ProArrowByBoundary, Theory, TheoryArrow, TheoryObject,
        TheoryProArrow,
    },
};

// TODO: check this whole file

/// The theory of database schemas with attributes, aka the "walking pro-arrow".
pub struct Schema;

const ENTITY: &str = "Entity";
const ATTR_TYPE: &str = "AttrType";
const ATTR: &str = "Attr";

impl Schema {
    fn attr_pro_arrow() -> TheoryProArrow<Self> {
        TheoryProArrow::Generator {
            name: ATTR.to_string(),
            dom: TheoryObject::Generator(ENTITY.to_string()),
            cod: TheoryObject::Generator(ATTR_TYPE.to_string()),
        }
    }
}

impl Theory for Schema {
    fn name() -> String {
        "Schema".to_string()
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

    fn generating_pro_arrow_by_name(name: &String) -> Option<TheoryProArrow<Self>> {
        (name == ATTR).then(Self::attr_pro_arrow)
    }

    fn pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self> {
        let entity = TheoryObject::Generator(ENTITY.to_string());
        let attr_type = TheoryObject::Generator(ATTR_TYPE.to_string());
        if Self::unify_objects(&[dom, &entity]).is_compatible()
            && Self::unify_objects(&[cod, &attr_type]).is_compatible()
        {
            ProArrowByBoundary::Composite(Composite::singleton(Self::attr_pro_arrow()))
        } else if let Some(hom) = Self::make_hom_pro_arrow(dom, cod) {
            ProArrowByBoundary::Hom(hom)
        } else {
            ProArrowByBoundary::None
        }
    }

    fn has_object(obj: &TheoryObject<Self>) -> bool {
        let entity = TheoryObject::Generator(ENTITY.to_string());
        let attr_type = TheoryObject::Generator(ATTR_TYPE.to_string());
        Self::unify_objects(&[obj, &entity]).is_compatible()
            || Self::unify_objects(&[obj, &attr_type]).is_compatible()
    }

    fn has_theory_arrow(_arr: TheoryArrow<Self>) -> bool {
        false
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
            TheoryProArrow::Restriction { .. } | TheoryProArrow::Hole { .. } => false,
        }
    }

    fn has_cell(b: &Boundary<Self>) -> bool {
        // Discrete double theory: the only cells are identities.
        b.dom_vertical.is_empty()
            && b.cod_vertical.is_empty()
            && Self::unify_objects(&[&b.dom_dom_object, &b.cod_dom_object]).is_compatible()
            && Self::unify_objects(&[&b.dom_cod_object, &b.cod_cod_object]).is_compatible()
            && Self::unify_pro_arrows(&[&b.dom_proarrow, &b.cod_proarrow]).is_compatible()
    }
}
