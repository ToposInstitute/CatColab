//! Double theories as used by DoubleTT.
//!
//! In `catlog`, double theories belonging to different double doctrines
//! (discrete theories, modal theories, etc) are represented using different
//! data structures. By contrast, there is just one implementation of DoubleTT,
//! intended to support all the features that we need. To provide a uniform
//! interface to theories of different doctrine, theories are boxed in an enum
//! ([`TheoryDef`]). This design is similar to the one taken for catlog's Wasm
//! bindings (`catlog-wasm`).

use all_the_same::all_the_same;
use derivative::Derivative;
use derive_more::{Constructor, From, TryInto};
use std::fmt;
use std::rc::Rc;

use super::prelude::*;
use crate::dbl::model::PrintableDblModel;
use crate::dbl::{discrete, modal, theory::DblTheory};
use crate::one::QualifiedPath;
use crate::stdlib::theories;
use crate::zero::{QualifiedName, name};

/// A theory supported by DoubleTT, comprising a name and a definition.
///
/// Equality of these theories is nominal; two theories are the same if and only
/// if they have the same name.
#[derive(Constructor, Clone, Derivative)]
#[derivative(PartialEq, Eq)]
pub struct Theory {
    /// The name of the theory.
    pub name: QualifiedName,
    /// The definition of the theory.
    #[derivative(PartialEq = "ignore")]
    pub definition: TheoryDef,
}

impl fmt::Display for Theory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name)
    }
}

/// Definition of a double theory supported by DoubleTT.
#[derive(Clone)]
pub enum TheoryDef {
    /// A discrete double theory.
    Discrete(Rc<discrete::DiscreteDblTheory>),
    /// A modal double theory.
    Modal(Rc<modal::ModalDblTheory>),
}

impl TheoryDef {
    /// Smart constructor for [`TheoryDef::Discrete`] case.
    pub fn discrete(theory: discrete::DiscreteDblTheory) -> Self {
        TheoryDef::Discrete(Rc::new(theory))
    }

    /// Smart constructor for [`TheoryDef::Modal`] case.
    pub fn modal(theory: modal::ModalDblTheory) -> Self {
        TheoryDef::Modal(Rc::new(theory))
    }

    /// Gets the basic object type with given name, if it exists.
    pub fn basic_ob_type(&self, name: QualifiedName) -> Option<ObType> {
        let ob_type = match self {
            TheoryDef::Discrete(_) => ObType::Discrete(name),
            TheoryDef::Modal(_) => ObType::Modal(modal::ModeApp::new(name)),
        };
        all_the_same!(match self {
            TheoryDef::[Discrete, Modal](th) => {
                if th.has_ob_type((&ob_type).try_into().unwrap()) {
                    Some(ob_type)
                } else {
                    None
                }
            }
        })
    }

    /// Gets the basic morphism type with given name, if it exists.
    pub fn basic_mor_type(&self, name: QualifiedName) -> Option<MorType> {
        let mor_type = match self {
            TheoryDef::Discrete(_) => MorType::Discrete(name.into()),
            TheoryDef::Modal(_) => MorType::Modal(modal::ModeApp::new(name).into()),
        };
        all_the_same!(match self {
            TheoryDef::[Discrete, Modal](th) => {
                if th.has_mor_type((&mor_type).try_into().unwrap()) {
                    Some(mor_type)
                } else {
                    None
                }
            }
        })
    }

    /// Gets the source type of a morphism type.
    pub fn src_type(&self, mor_type: &MorType) -> ObType {
        all_the_same!(match self {
            TheoryDef::[Discrete, Modal](th) => {
                th.src_type(mor_type.try_into().unwrap()).into()
            }
        })
    }

    /// Gets the target type of a morphism type.
    pub fn tgt_type(&self, mor_type: &MorType) -> ObType {
        all_the_same!(match self {
            TheoryDef::[Discrete, Modal](th) => {
                th.tgt_type(mor_type.try_into().unwrap()).into()
            }
        })
    }

    /// Gets the hom (identity) type for an object type.
    pub fn hom_type(&self, ob_type: ObType) -> MorType {
        all_the_same!(match self {
            TheoryDef::[Discrete, Modal](th) => {
                th.hom_type(ob_type.try_into().unwrap()).into()
            }
        })
    }

    /// Composes a pair of morphism types, if they have a composite.
    pub fn compose_types2(&self, mt1: MorType, mt2: MorType) -> Option<MorType> {
        all_the_same!(match self {
            TheoryDef::[Discrete, Modal](th) => {
                let path = Path::pair(mt1.try_into().unwrap(), mt2.try_into().unwrap());
                th.compose_types(path).map(|mt| mt.into())
            }
        })
    }
}

/// Object type in a double theory supported by DoubleTT.
#[derive(Clone, Debug, From, TryInto, PartialEq, Eq)]
#[try_into(owned, ref)]
pub enum ObType {
    /// Object type in a discrete theory.
    Discrete(QualifiedName),
    /// Object type in a modal theory.
    Modal(modal::ModalObType),
}

impl ObType {
    /// Destructures a modality application, if possible.
    pub fn mode_app(self) -> Option<(modal::Modality, ObType)> {
        match self {
            ObType::Discrete(_) => None,
            ObType::Modal(ob_type) => {
                let (maybe_modality, ob_type) = ob_type.pop_app();
                maybe_modality.map(|modality| (modality, ob_type.into()))
            }
        }
    }

    /// Gets the argument of a list modality application, if the type is one.
    pub fn list_arg(self) -> Option<ObType> {
        self.mode_app().and_then(|(modality, ob_type)| match modality {
            modal::Modality::List(_) => Some(ob_type),
            _ => None,
        })
    }
}

impl ToDoc for ObType {
    fn to_doc<'a>(&self) -> D<'a> {
        match self {
            ObType::Discrete(name) => discrete::DiscreteDblModel::ob_type_to_doc(name),
            ObType::Modal(ob_type) => modal::ModalDblModel::ob_type_to_doc(ob_type),
        }
    }
}

impl fmt::Display for ObType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}

/// Morphism type in a double theory supported by DoubleTT.
#[derive(Clone, Debug, From, TryInto, PartialEq, Eq)]
#[try_into(owned, ref)]
pub enum MorType {
    /// Morphism type in a discrete theory.
    Discrete(QualifiedPath),
    /// Morphism type in a model theory.
    Modal(modal::ModalMorType),
}

impl ToDoc for MorType {
    fn to_doc<'a>(&self) -> D<'a> {
        match self {
            MorType::Discrete(path) => discrete::DiscreteDblModel::mor_type_to_doc(path),
            MorType::Modal(mor_type) => modal::ModalDblModel::mor_type_to_doc(mor_type),
        }
    }
}

impl fmt::Display for MorType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}

/// Construct a library of standard theories
pub fn std_theories() -> HashMap<QualifiedName, Theory> {
    [
        (name("ThSchema"), TheoryDef::discrete(theories::th_schema())),
        (name("ThCategory"), TheoryDef::discrete(theories::th_category())),
        (name("ThSignedCategory"), TheoryDef::discrete(theories::th_signed_category())),
        (name("ThMulticategory"), TheoryDef::modal(theories::th_multicategory())),
    ]
    .into_iter()
    .map(|(name, def)| (name.clone(), Theory::new(name, def)))
    .collect()
}
