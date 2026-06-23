use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    theory::{
        Boundary, ListVariant, ProArrowByBoundary, Theory, TheoryArrow, TheoryObject,
        TheoryProArrow,
    },
};

/// The modal double theory of generalized (planar) multicategories: a single
/// object `Object`, a single pro-arrow `P: List Object -|-> Object`. Unlike the
/// strict abstract presentation, our encoding here includes no vertical
/// morphisms. The reason for this is the overall philosophy of [Theory]: the
/// monad structure is not given in terms of explicit generators and relations
/// which could complicate a decision procedure, but rather borne by the use of
/// [ProTerm::ListManipulation]. See [list] for additional details.
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
        let real_p = Self::p_pro_arrow();
        let p_filler = (Self::unify_objects(&[dom, &real_p.dom()]).is_compatible()
            && Self::unify_objects(&[cod, &real_p.cod()]).is_compatible())
        .then(|| real_p)
        .map(Composite::singleton)
        .map(ProArrowByBoundary::Composite);

        let hom_filler = Self::make_hom_pro_arrow(dom, cod).map(ProArrowByBoundary::Hom);

        match (p_filler, hom_filler) {
            (Some(result), None) => result,
            (None, Some(result)) => result,
            (None, None) => ProArrowByBoundary::None,
            _ => ProArrowByBoundary::Ambiguous,
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

            TheoryProArrow::Generator { name, dom, cod } => {
                *name == *P
                    && Self::has_object(cod)
                    && Self::unify_objects(&[dom, &Self::list_of(cod)]).is_compatible()
            }

            TheoryProArrow::ModalApplication { modality, on } => {
                Self::list_modality().as_ref() == Some(modality) && Self::has_pro_arrow(on)
            }

            TheoryProArrow::Restriction { .. } | TheoryProArrow::Hole { .. } => false,
        }
    }

    fn has_cell(b: &Boundary<Self>) -> bool {
        // Because we have no vertical arrows in this presentation of a theory,
        // all the remaining valid cells are globular.
        if !(b.dom_vertical.is_empty() && b.cod_vertical.is_empty()) {
            return false;
        };

        // the objects must all be valid, along with all of the pro-arrows, and
        // the bottom composite must be non-empty
        if !b.objects().into_iter().all(Self::has_object)
            || !b.dom_proarrow.iter().all(Self::has_pro_arrow)
            || !b.cod_proarrow.iter().all(Self::has_pro_arrow)
            || b.cod_proarrow.is_empty()
        {
            return false;
        }

        let hom = |o: &TheoryObject<Self>| Composite::singleton(TheoryProArrow::Hom(o.clone()));

        if b.dom_proarrow.is_empty() {
            // if the top is empty the bottom must be unifiable with a single
            // hom (unification is up-to laws)
            Self::unify_pro_arrows(&[&b.cod_proarrow, &hom(&b.cod_dom_object)]).is_compatible()
        } else if Self::unify_pro_arrows(&[&b.dom_proarrow, &hom(&b.dom_dom_object)])
            .is_compatible()
        {
            // if the top unifies against a single hom, so too must the bottom
            Self::unify_pro_arrows(&[&b.cod_proarrow, &hom(&b.cod_dom_object)]).is_compatible()
        } else {
            // at this point the top boundary is of the form List P^n ; ... ;
            // List P^0 because:
            // * it is non-empty
            // * it does not unify against hom (recall List hom = hom_List)
            // * it is comprised of valid pro-arrows in the theory (hom & P,
            //   List on those, no restrictions)
            // with that in mind, all that remains to check is whether the top
            // and bottom boundary unify because there are no non-trivial cells.
            Self::unify_pro_arrows(&[&b.dom_proarrow, &b.cod_proarrow]).is_compatible()
        }
    }
}
