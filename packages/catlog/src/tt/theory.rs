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
use crate::dbl::theory::{DblTheory, DiscreteDblTheory};
use crate::one::Path;
use crate::stdlib::theories;
use crate::zero::{QualifiedName, name};
use ::pretty::RcDoc;

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
    Discrete(Rc<DiscreteDblTheory>),
    // A modal double theory.
    // Modal(Rc<ModalDblTheory>),
}

impl TheoryDef {
    /// Smart constructor for [`TheoryDef::Discrete`] case.
    pub fn discrete(theory: DiscreteDblTheory) -> Self {
        TheoryDef::Discrete(Rc::new(theory))
    }

    /// Gets the basic object type with given name, if it exists.
    pub fn basic_ob_type(&self, name: QualifiedName) -> Option<ObType> {
        match self {
            TheoryDef::Discrete(th) => {
                if th.has_ob_type(&name) {
                    Some(ObType::Discrete(name))
                } else {
                    None
                }
            }
        }
    }

    /// Gets the basic morphism type with given name, if it exists.
    pub fn basic_mor_type(&self, name: QualifiedName) -> Option<MorType> {
        match self {
            TheoryDef::Discrete(th) => {
                let mor_type = Path::single(name);
                if th.has_mor_type(&mor_type) {
                    Some(MorType::Discrete(mor_type))
                } else {
                    None
                }
            }
        }
    }

    /// Gets the source type of a morphism type.
    pub fn src_type(&self, mor_type: &MorType) -> ObType {
        all_the_same!(match self {
            TheoryDef::[Discrete](th) => {
                th.src_type(mor_type.try_into().unwrap()).into()
            }
        })
    }

    /// Gets the target type of a morphism type.
    pub fn tgt_type(&self, mor_type: &MorType) -> ObType {
        all_the_same!(match self {
            TheoryDef::[Discrete](th) => {
                th.tgt_type(mor_type.try_into().unwrap()).into()
            }
        })
    }

    /// Gets the hom (identity) type for an object type.
    pub fn hom_type(&self, ob_type: ObType) -> MorType {
        all_the_same!(match self {
            TheoryDef::[Discrete](th) => {
                th.hom_type(ob_type.try_into().unwrap()).into()
            }
        })
    }

    /// Composes a pair of morphism types, if they have a composite.
    pub fn compose_types2(&self, mt1: MorType, mt2: MorType) -> Option<MorType> {
        all_the_same!(match self {
            TheoryDef::[Discrete](th) => {
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
}

impl fmt::Display for ObType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}

impl ObType {
    fn to_doc<'a>(&self) -> D<'a> {
        match self {
            ObType::Discrete(name) => t(format!("{name}")),
        }
    }
}

/// Morphism type in a double theory supported by DoubleTT.
#[derive(Clone, Debug, From, TryInto, PartialEq, Eq)]
#[try_into(owned, ref)]
pub enum MorType {
    /// Morphism type in a discrete theory.
    Discrete(Path<QualifiedName, QualifiedName>),
}

impl fmt::Display for MorType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}

impl MorType {
    /// Pretty prints the morphism type.
    pub fn to_doc<'a>(&self) -> D<'a> {
        match self {
            MorType::Discrete(Path::Id(ot)) => (t("Id") + s() + t(format!("{ot}"))).parens(),
            MorType::Discrete(Path::Seq(non_empty)) => {
                if non_empty.len() == 1 {
                    t(format!("{}", non_empty[0]))
                } else {
                    D(RcDoc::intersperse(non_empty.iter().map(|x| t(format!("{x}")).0), t(" · ").0))
                        .parens()
                }
            }
        }
    }
}

/// Construct a library of standard theories
pub fn std_theories() -> HashMap<QualifiedName, Theory> {
    [
        (name("ThSchema"), TheoryDef::discrete(theories::th_schema())),
        (name("ThCategory"), TheoryDef::discrete(theories::th_category())),
        (name("ThSignedCategory"), TheoryDef::discrete(theories::th_signed_category())),
    ]
    .into_iter()
    .map(|(name, def)| (name.clone(), Theory::new(name, def)))
    .collect()
}
