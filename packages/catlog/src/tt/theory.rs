//! Double theories as used by DoubleTT.

use derivative::Derivative;
use derive_more::Constructor;
use std::fmt;
use std::rc::Rc;

use super::prelude::*;
use crate::one::Path;
use crate::zero::{QualifiedName, name};
use crate::{dbl::theory::DiscreteDblTheory, stdlib::theories};
use ::pretty::RcDoc;

/// A theory supported by doublett.
///
/// Equality of these theories is nominal; two theories are the same if and only
/// if they have the same name.
///
/// When we add features to doublett, this will become an enum; doublett will
/// never be parametric (e.g., we will not thread a "theory" type through a bunch
/// of structs in doublett).
#[derive(Constructor, Clone, Derivative)]
#[derivative(PartialEq, Eq)]
pub struct Theory {
    /// The name of the theory.
    pub name: QualifiedName,
    /// The definition of the theory.
    #[derivative(PartialEq = "ignore")]
    pub definition: Rc<DiscreteDblTheory>,
}

impl fmt::Display for Theory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name)
    }
}

/// Object types are just qualified names, see [DiscreteDblTheory].
pub type ObjectType = QualifiedName;

/// Morphism types are paths of qualified names, see [DiscreteDblTheory].
#[derive(Clone, PartialEq, Eq)]
pub struct MorphismType(pub Path<QualifiedName, QualifiedName>);

impl fmt::Display for MorphismType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().group().pretty())
    }
}

impl MorphismType {
    /// Pretty prints the morphism type.
    pub fn to_doc<'a>(&self) -> D<'a> {
        match &self.0 {
            Path::Id(ot) => (t("Id") + s() + t(format!("{ot}"))).parens(),
            Path::Seq(non_empty) => {
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
        (name("ThSchema"), theories::th_schema()),
        (name("ThCategory"), theories::th_category()),
        (name("ThSignedCategory"), theories::th_signed_category()),
    ]
    .into_iter()
    .map(|(name, def)| (name.clone(), Theory::new(name.clone(), Rc::new(def))))
    .collect()
}
