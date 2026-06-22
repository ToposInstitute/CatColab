use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    theory::{
        Boundary, ListVariant, ProArrowByBoundary, Theory, TheoryArrow, TheoryObject,
        TheoryProArrow, UnificationResult,
    },
};

// TODO: check this whole file
// TODO: i don't actually want eta and mu

/// The modal double theory of generalized (planar) multicategories: a single
/// object `𝕏`, a single pro-arrow `P: List 𝕏 -|-> 𝕏`, and the list-monad
/// structure as vertical arrows `η: 𝕏 → List 𝕏` and `μ: List List 𝕏 → List 𝕏`.
/// The latter are needed to express the multicategory composition cell, whose
/// boundary carries `μ`.
pub struct Multicategory;

const OBJECT: &str = "Object";
const P: &str = "P";
const MU: &str = "mu";
const ETA: &str = "eta";

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

    /// The list-monad unit `η: 𝕏 → List 𝕏`.
    fn eta_arrow() -> TheoryArrow<Self> {
        TheoryArrow::Generator {
            name: ETA.to_string(),
            dom: Self::object(),
            cod: Self::list_of(&Self::object()),
        }
    }

    /// The list-monad multiplication `μ: List List 𝕏 → List 𝕏`.
    fn mu_arrow() -> TheoryArrow<Self> {
        TheoryArrow::Generator {
            name: MU.to_string(),
            dom: Self::list_of(&Self::list_of(&Self::object())),
            cod: Self::list_of(&Self::object()),
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

    fn generating_arrow_by_name(name: &String) -> Option<TheoryArrow<Self>> {
        if name == MU {
            Some(Self::mu_arrow())
        } else if name == ETA {
            Some(Self::eta_arrow())
        } else {
            None
        }
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

    fn unify_pro_arrows(
        _composites: &[&Composite<TheoryProArrow<Self>>],
    ) -> UnificationResult<Composite<TheoryProArrow<Self>>> {
        // TODO: the default (`default_pro_arrow_composite_unify`) only knows the
        // unitality of hom. This theory has further equations --- the list
        // monad's `μ`/`η` and interchange laws such as List(Hom) = Hom(List) ---
        // so unification must be reworked to respect them.
        todo!()
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

    fn has_theory_arrow(arr: TheoryArrow<Self>) -> bool {
        // The vertical arrows are the list-monad structure `μ` and `η`, valid
        // at any modal depth (modal applications recurse).
        match arr {
            TheoryArrow::Generator { name, dom, cod } => {
                let generator = if name == MU {
                    Self::mu_arrow()
                } else if name == ETA {
                    Self::eta_arrow()
                } else {
                    return false;
                };
                Self::unify_objects(&[&dom, &generator.dom()]).is_compatible()
                    && Self::unify_objects(&[&cod, &generator.cod()]).is_compatible()
            }
            TheoryArrow::ModalApplication { modality, on } => {
                Self::list_modality().as_ref() == Some(&modality) && Self::has_theory_arrow(*on)
            }
        }
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

            // TODO: there are no vertical arrows
            TheoryProArrow::Restriction { .. } | TheoryProArrow::Hole { .. } => false,
        }
    }

    fn has_cell(_b: &Boundary<Self>) -> bool {
        // TODO: the cells here include the multicategory composition `γ`, whose
        // boundary carries the list-multiplication `μ`, so this is *not* just
        // globular identity-up-to-unitality. We need the vertical arrows `μ`/`η`
        // and an account of the further equations (e.g. List(Hom) = Hom(List))
        // before this can be written correctly.
        todo!()
    }
}
