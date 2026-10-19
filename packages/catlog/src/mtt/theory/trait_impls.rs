//! [Holy], [Clone], [Display], [Composable], and [BinarySignature]
//! implementations for [core_types].

use std::marker::PhantomData;

use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composable,
    hole::Holy,
    theory::{
        Boundary, Theory, TheoryObject, TheoryProArrow, TheoryVerticalArrow,
        list_modality::ListModality, modal_depth::ModalDepth,
    },
};

// -----------------------------------------------------------------------------
// Boundary

impl<T: Theory> Clone for Boundary<T> {
    fn clone(&self) -> Self {
        Boundary {
            dom_dom_object: self.dom_dom_object.clone(),
            dom_cod_object: self.dom_cod_object.clone(),
            cod_dom_object: self.cod_dom_object.clone(),
            cod_cod_object: self.cod_cod_object.clone(),
            dom_vertical: self.dom_vertical.clone(),
            dom_proarrow: self.dom_proarrow.clone(),
            cod_vertical: self.cod_vertical.clone(),
            cod_proarrow: self.cod_proarrow.clone(),
        }
    }
}

impl<T: Theory> std::fmt::Display for Boundary<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Boundary {{ \
            dom_dom: {}, dom_cod: {}, \
            cod_dom: {}, cod_cod: {}, \
            dom_vertical: {}, cod_vertical: {}, \
            dom_proarrow: {}, cod_proarrow: {} }}",
            self.dom_dom_object,
            self.dom_cod_object,
            self.cod_dom_object,
            self.cod_cod_object,
            self.dom_vertical,
            self.cod_vertical,
            self.dom_proarrow,
            self.cod_proarrow,
        )
    }
}

// -----------------------------------------------------------------------------
// TheoryObject

impl<T: Theory> Holy for TheoryObject<T> {
    fn unconstrained(name: String) -> Self {
        TheoryObject::Hole { name, _theory: PhantomData }
    }

    fn is_hole(&self) -> bool {
        matches!(self, TheoryObject::Hole { .. })
    }
}

impl<T: Theory> Clone for TheoryObject<T> {
    fn clone(&self) -> Self {
        match self {
            Self::Generator(g) => Self::Generator(g.clone()),
            Self::ModalApplication(on) => Self::ModalApplication(on.clone()),
            Self::Hole { name, .. } => Self::Hole { name: name.clone(), _theory: PhantomData },
        }
    }
}

impl<T: Theory> std::fmt::Display for TheoryObject<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Generator(g) => write!(f, "{g}"),
            Self::ModalApplication(on) => {
                write!(f, "{}({on})", <T::ListModality as ListModality>::NAME)
            }
            Self::Hole { name, .. } => write!(f, "?({name})"),
        }
    }
}

// -----------------------------------------------------------------------------
// TheoryArrow

impl<T: Theory> BinarySignature<TheoryObject<T>> for TheoryVerticalArrow<T> {
    /// The domain object of the vertical arrow. A modal application lifts its
    /// inner arrow's domain under the modality.
    fn dom(&self) -> TheoryObject<T> {
        // TODO: check this.
        match self {
            TheoryVerticalArrow::Generator { dom, .. } => dom.clone(),
            TheoryVerticalArrow::ModalApplication(on) => {
                TheoryObject::ModalApplication(Box::new(on.as_ref().dom()))
            }
            // The base object is fixed by the surrounding boundary; here we
            // expose the modal tower over an unconstrained base so that
            // structural unification can refine it against the actual corner.
            TheoryVerticalArrow::ModalStructureMap(map) => {
                TheoryObject::unconstrained("modal_structure_map_base".to_string())
                    .re_nest(map.dom())
                    .expect("re-nesting an unconstrained base to a non-negative depth never fails")
            }
        }
    }

    /// The codomain object of the vertical arrow. A modal application lifts its
    /// inner arrow's codomain under the modality.
    fn cod(&self) -> TheoryObject<T> {
        // TODO: check this.
        match self {
            TheoryVerticalArrow::Generator { cod, .. } => cod.clone(),
            TheoryVerticalArrow::ModalApplication(on) => {
                TheoryObject::ModalApplication(Box::new(on.as_ref().cod()))
            }
            TheoryVerticalArrow::ModalStructureMap(map) => {
                TheoryObject::unconstrained("modal_structure_map_base".to_string())
                    .re_nest(map.cod())
                    .expect("re-nesting an unconstrained base to a non-negative depth never fails")
            }
        }
    }
}

impl<T: Theory> Clone for TheoryVerticalArrow<T> {
    fn clone(&self) -> Self {
        // TODO: check this.
        match self {
            TheoryVerticalArrow::Generator { name, dom, cod } => TheoryVerticalArrow::Generator {
                name: name.clone(),
                dom: dom.clone(),
                cod: cod.clone(),
            },
            TheoryVerticalArrow::ModalApplication(on) => {
                TheoryVerticalArrow::ModalApplication(on.clone())
            }
            TheoryVerticalArrow::ModalStructureMap(map) => {
                TheoryVerticalArrow::ModalStructureMap(map.clone())
            }
        }
    }
}

impl<T: Theory> std::fmt::Display for TheoryVerticalArrow<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // TODO: check this.
        match self {
            TheoryVerticalArrow::Generator { name, dom, cod } => {
                write!(f, "{name}: {dom} -> {cod}")
            }
            TheoryVerticalArrow::ModalApplication(on) => {
                write!(f, "{}({on})", <T::ListModality as ListModality>::NAME)
            }
            TheoryVerticalArrow::ModalStructureMap(map) => write!(f, "{map}"),
        }
    }
}

impl<T: Theory> Composable for TheoryVerticalArrow<T> {
    fn composable(&self, next: &Self) -> bool {
        T::unify_objects(&[&self.cod(), &next.dom()]).is_compatible()
    }
}

// -----------------------------------------------------------------------------
// TheoryProArrow

impl<T: Theory> Holy for TheoryProArrow<T> {
    fn unconstrained(name: String) -> Self {
        TheoryProArrow::Hole {
            dom: TheoryObject::unconstrained(name.clone()),
            cod: TheoryObject::unconstrained(name),
        }
    }

    fn is_hole(&self) -> bool {
        matches!(self, TheoryProArrow::Hole { .. })
    }
}

impl<T: Theory> BinarySignature<TheoryObject<T>> for TheoryProArrow<T> {
    /// The domain object of the pro-arrow. For a restriction this is the domain
    /// of the restricting vertical arrow.
    fn dom(&self) -> TheoryObject<T> {
        match self {
            TheoryProArrow::Hom(o) => o.clone(),
            TheoryProArrow::Generator { dom, .. } => dom.clone(),
            TheoryProArrow::ModalApplication(on) => {
                TheoryObject::ModalApplication(Box::new(on.as_ref().dom()))
            }
            TheoryProArrow::Restriction { dom_leg, .. } => dom_leg.dom(),
            TheoryProArrow::Hole { dom, .. } => dom.clone(),
        }
    }

    /// The codomain object of the pro-arrow. For a restriction this is the
    /// domain of the restricting vertical arrow on the codomain side.
    fn cod(&self) -> TheoryObject<T> {
        match self {
            TheoryProArrow::Hom(o) => o.clone(),
            TheoryProArrow::Generator { cod, .. } => cod.clone(),
            TheoryProArrow::ModalApplication(on) => {
                TheoryObject::ModalApplication(Box::new(on.as_ref().cod()))
            }
            TheoryProArrow::Restriction { cod_leg, .. } => cod_leg.dom(),
            TheoryProArrow::Hole { cod, .. } => cod.clone(),
        }
    }
}

impl<T: Theory> Clone for TheoryProArrow<T> {
    fn clone(&self) -> Self {
        match self {
            TheoryProArrow::Hom(o) => TheoryProArrow::Hom(o.clone()),
            TheoryProArrow::Generator { name, dom, cod } => TheoryProArrow::Generator {
                name: name.clone(),
                dom: dom.clone(),
                cod: cod.clone(),
            },
            TheoryProArrow::ModalApplication(on) => TheoryProArrow::ModalApplication(on.clone()),
            TheoryProArrow::Restriction { base, dom_leg, cod_leg } => TheoryProArrow::Restriction {
                base: base.clone(),
                dom_leg: dom_leg.clone(),
                cod_leg: cod_leg.clone(),
            },
            TheoryProArrow::Hole { dom, cod } => {
                TheoryProArrow::Hole { dom: dom.clone(), cod: cod.clone() }
            }
        }
    }
}

impl<T: Theory> std::fmt::Display for TheoryProArrow<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TheoryProArrow::Hom(o) => write!(f, "Hom({o})"),
            TheoryProArrow::Generator { name, dom, cod } => write!(f, "{name}: {dom} -|-> {cod}"),
            TheoryProArrow::ModalApplication(on) => {
                write!(f, "{}({on})", <T::ListModality as ListModality>::NAME)
            }
            TheoryProArrow::Restriction { base, dom_leg, cod_leg } => {
                write!(f, "({base})({dom_leg}, {cod_leg})")
            }
            TheoryProArrow::Hole { .. } => write!(f, "_"),
        }
    }
}

impl<T: Theory> Composable for TheoryProArrow<T> {
    fn composable(&self, next: &Self) -> bool {
        T::unify_objects(&[&self.cod(), &next.dom()]).is_compatible()
    }
}
