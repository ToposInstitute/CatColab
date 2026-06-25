use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    theory::{
        Boundary, ListVariant, ProArrowByBoundary, Theory, TheoryArrow, TheoryObject,
        TheoryProArrow,
    },
};

/// The theory of database schemas with attributes.
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

        let attr = (Self::unify_objects(&[dom, &entity]).is_compatible()
            && Self::unify_objects(&[cod, &attr_type]).is_compatible())
        .then(Self::attr_pro_arrow)
        .map(Composite::singleton)
        .map(ProArrowByBoundary::Composite);

        let hom = Self::make_hom_pro_arrow(dom, cod).map(ProArrowByBoundary::Hom);
        match (attr, hom) {
            (Some(result), None) => result,
            (None, Some(result)) => result,
            (None, None) => ProArrowByBoundary::None,
            _ => ProArrowByBoundary::Ambiguous,
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
            // Schema has no list modality, so modal pro-arrows are invalid.
            TheoryProArrow::ModalApplication { .. }
            | TheoryProArrow::Restriction { .. }
            | TheoryProArrow::Hole { .. } => false,
        }
    }

    fn has_cell(b: &Boundary<Self>) -> bool {
        // these cells must be globular
        if !(b.dom_vertical.is_empty() && b.cod_vertical.is_empty()) {
            return false;
        };

        // the objects must all be valid
        if !b.objects().into_iter().all(Self::has_object) {
            return false;
        }

        // regardless of what happens in the pro-arrow world me must recognise
        // them all and the bottom may not be empty
        if !b.dom_proarrow.iter().all(Self::has_pro_arrow)
            || !b.cod_proarrow.iter().all(Self::has_pro_arrow)
            || b.cod_proarrow.is_empty()
        {
            return false;
        }

        let hom = |o: &TheoryObject<Self>| Composite::singleton(TheoryProArrow::Hom(o.clone()));
        let attr = Composite::singleton(Self::attr_pro_arrow());

        if b.dom_proarrow.is_empty() {
            // if the top is empty the bottom must be unifiable with a single
            // hom, relying on the default implementation which treats hom as
            // unital
            Self::unify_pro_arrows(&[&b.cod_proarrow, &hom(&b.cod_dom_object)]).is_compatible()
        } else if Self::unify_pro_arrows(&[&b.dom_proarrow, &hom(&b.dom_dom_object)])
            .is_compatible()
        {
            // if the top unifies against a single hom, so too must the bottom
            Self::unify_pro_arrows(&[&b.cod_proarrow, &hom(&b.cod_dom_object)]).is_compatible()
        } else if Self::unify_pro_arrows(&[&b.dom_proarrow, &attr]).is_compatible() {
            // if the top unifies against a single Attr then so too must the bottom
            Self::unify_pro_arrows(&[&b.cod_proarrow, &attr]).is_compatible()
        } else {
            false
        }
    }

    fn cell_search(
        top: &Composite<TheoryProArrow<Self>>,
        bottom: &Composite<TheoryProArrow<Self>>,
    ) -> Option<Boundary<Self>> {
        // TODO: check this.
        //
        // TODO: implement cell_search for the theory of database schemas. This
        // theory has no list modality, so the search amounts to finding globular
        // cells whose vertical legs are identity, governed by the Attr/Hom
        // structure of the theory.
        let _ = (top, bottom);
        todo!("cell_search for Schema")
    }
}
