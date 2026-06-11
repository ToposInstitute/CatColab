use std::collections::HashSet;

use crate::mtt::{
    checker::{Boundary, TheoryGeneratingArrow, TheoryObject, TheoryProArrow},
    theory::{
        ListVariant, Theory,
        shared::{HOM, hom_pro_arrow, pro_arrow_composites_match},
    },
};

/// The theory of database schemas with attributes, aka the "walking pro-arrow".
pub struct Schema;

/// The "entity" object generator.
const ENTITY: &str = "Entity";
/// The "attribute type" object generator.
const ATTR_TYPE: &str = "AttrType";
/// The single generating pro-arrow.
const ATTR: &str = "Attr";

impl Schema {
    /// The boundary of the generating `Attr` pro-arrow, `Entity -|-> AttrType`.
    fn attr_pro_arrow() -> TheoryProArrow<Self> {
        TheoryProArrow::from(
            ATTR.to_string(),
            TheoryObject::Generator(ENTITY.to_string()),
            TheoryObject::Generator(ATTR_TYPE.to_string()),
        )
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
        Self::objects_unify(&[obj_a, obj_b]).then(|| hom_pro_arrow(obj_a, obj_b))
    }

    fn lookup_generating_arrow(_name: &String) -> Option<TheoryGeneratingArrow<Self>> {
        // There are no non-trivial vertical arrows.
        None
    }

    fn lookup_generating_pro_arrow(name: &String) -> Option<TheoryProArrow<Self>> {
        // `Attr` is the only named generating pro-arrow; the homs are
        // parametric in their object and so are not nameable on their own.
        (name == ATTR).then(Self::attr_pro_arrow)
    }

    fn generating_pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> HashSet<String> {
        // The only non-hom boundary that is filled is (Entity, AttrType), by
        // `Attr`. Self-boundaries are filled only by homs, which are recovered
        // via `make_hom_pro_arrow` rather than reported here.
        let entity = TheoryObject::Generator(ENTITY.to_string());
        let attr_type = TheoryObject::Generator(ATTR_TYPE.to_string());
        if Self::objects_unify(&[dom, &entity]) && Self::objects_unify(&[cod, &attr_type]) {
            HashSet::from([ATTR.to_string()])
        } else {
            HashSet::new()
        }
    }

    fn has_object(obj: &TheoryObject<Self>) -> bool {
        let entity = TheoryObject::Generator(ENTITY.to_string());
        let attr_type = TheoryObject::Generator(ATTR_TYPE.to_string());
        Self::objects_unify(&[obj, &entity]) || Self::objects_unify(&[obj, &attr_type])
    }

    fn has_generating_arrow(_arr: TheoryGeneratingArrow<Self>) -> bool {
        false
    }

    fn has_pro_arrow(pro: &TheoryProArrow<Self>) -> bool {
        let attr = Self::attr_pro_arrow();
        // Either the `Attr` generator, or a hom on one of the two objects.
        let is_attr = pro.name == ATTR
            && Self::objects_unify(&[&pro.dom, &attr.dom])
            && Self::objects_unify(&[&pro.cod, &attr.cod]);
        let is_hom = pro.name == HOM
            && Self::has_object(&pro.dom)
            && Self::objects_unify(&[&pro.dom, &pro.cod]);
        is_attr || is_hom
    }

    fn has_cell(b: &Boundary<Self>) -> bool {
        // Discrete double theory: the only cells are identities, so the
        // vertical boundaries must be identities and the two pro-arrow
        // boundaries must coincide.
        b.dom_vertical.is_empty()
            && b.cod_vertical.is_empty()
            && Self::objects_unify(&[&b.dom_dom_object, &b.cod_dom_object])
            && Self::objects_unify(&[&b.dom_cod_object, &b.cod_cod_object])
            && pro_arrow_composites_match::<Self>(&b.dom_proarrow, &b.cod_proarrow)
    }
}
