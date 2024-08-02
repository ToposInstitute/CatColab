//! Wasm bindings for models of double theories.

use uuid::Uuid;

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use super::theory::*;
use catlog::dbl::model::{self as dbl_model, InvalidDiscreteDblModel};
use catlog::one::fin_category::UstrFinCategory;
use catlog::one::Path;
use catlog::validate::{self, Validate};

#[cfg(test)]
use catlog::dbl::model::DblModel as BaseDblModel;

/// An object in a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Ob {
    /// Basic or generating object.
    Basic(Uuid),

    /// A morphism viewed as an object of a tabulator.
    Tabulated(Mor),
}

/// A morphism in a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Mor {
    /// Basic or generating morphism.
    Basic(Uuid),

    /// Composite of morphisms.
    Composite(Box<Path<Ob, Mor>>),
}

/// Convert from object in a model of discrete double theory.
impl From<Uuid> for Ob {
    fn from(value: Uuid) -> Self {
        Ob::Basic(value)
    }
}

/// Convert from morphism in a model of a discrete double theory.
impl From<Path<Uuid, Uuid>> for Mor {
    fn from(path: Path<Uuid, Uuid>) -> Self {
        if let Some(e) = path.only() {
            Mor::Basic(*e)
        } else {
            Mor::Composite(Box::new(path.map(Ob::Basic, Mor::Basic)))
        }
    }
}

/// Convert into object in a model of a discrete double theory.
impl TryFrom<Ob> for Uuid {
    type Error = ();

    fn try_from(ob: Ob) -> Result<Self, Self::Error> {
        match ob {
            Ob::Basic(id) => Ok(id),
            _ => Err(()),
        }
    }
}

/// Convert into morphism in a model of a discrete double theory.
impl TryFrom<Mor> for Path<Uuid, Uuid> {
    type Error = ();

    fn try_from(mor: Mor) -> Result<Self, Self::Error> {
        match mor {
            Mor::Basic(id) => Ok(Path::single(id)),
            Mor::Composite(path) => {
                let maybe_path = (*path).try_map(|ob| ob.try_into().ok(), |mor| mor.try_into().ok());
                maybe_path.map(|path| path.flatten()).ok_or(())
            }
        }
    }
}

/// Declaration of an object in a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct ObDecl {
    /// Globally unique identifier of object.
    pub id: Uuid,

    /// Object type in double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,
}

/// Declaration of a morphism in a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MorDecl {
    /// Globally unique identifier of morphism.
    pub id: Uuid,

    /// Morphism type in double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Domain of morphism, if defined.
    pub dom: Option<Ob>,

    /// Codomain of morphism, if defined.
    pub cod: Option<Ob>,
}

/// Wasm bindings for validation errors in a model of a discrete double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiscreteDblModelErrors(Vec<InvalidDiscreteDblModel<Uuid>>);

type UuidDiscreteDblModel = dbl_model::DiscreteDblModel<Uuid, UstrFinCategory>;

/// Wrapper for models of double theories of various kinds.
#[allow(clippy::large_enum_variant)]
enum DblModelWrapper {
    Discrete(UuidDiscreteDblModel),
    DiscreteTab(()), // Not yet implemented.
}

/// Wasm bindings for a model of a double theory.
#[wasm_bindgen]
pub struct DblModel(DblModelWrapper);

#[wasm_bindgen]
impl DblModel {
    /// Creates an empty model of the given theory.
    #[wasm_bindgen(constructor)]
    pub fn new(theory: &DblTheory) -> Self {
        let wrapper = match &theory.theory {
            DblTheoryWrapper::Discrete(th) => {
                DblModelWrapper::Discrete(UuidDiscreteDblModel::new(th.clone()))
            }
            DblTheoryWrapper::DiscreteTab(_) => DblModelWrapper::DiscreteTab(()),
        };
        Self(wrapper)
    }

    /// Adds an object to the model.
    #[wasm_bindgen(js_name = "addOb")]
    pub fn add_ob(&mut self, decl: ObDecl) {
        if let DblModelWrapper::Discrete(model) = &mut self.0 {
            // FIXME: Don't just unwrap.
            let ob_type = decl.ob_type.try_into().unwrap();
            model.add_ob(decl.id, ob_type);
        }
    }

    /// Adds a morphism to the model.
    #[wasm_bindgen(js_name = "addMor")]
    pub fn add_mor(&mut self, decl: MorDecl) {
        if let DblModelWrapper::Discrete(model) = &mut self.0 {
            // FIXME: Don't just unwrap.
            let mor_type = decl.mor_type.try_into().unwrap();
            model.make_mor(decl.id, mor_type);
            model.update_dom(decl.id, decl.dom.map(|ob| ob.try_into().unwrap()));
            model.update_cod(decl.id, decl.cod.map(|ob| ob.try_into().unwrap()));
        }
    }

    /// Validates that the model is well defined.
    #[wasm_bindgen]
    pub fn validate(&self) -> DiscreteDblModelErrors {
        DiscreteDblModelErrors(match &self.0 {
            DblModelWrapper::Discrete(model) => validate::unwrap_errors(model.validate()),
            _ => Vec::new(),
        })
    }

    #[cfg(test)]
    fn ob_count(&self) -> usize {
        match &self.0 {
            DblModelWrapper::Discrete(model) => model.objects().count(),
            _ => 0,
        }
    }

    #[cfg(test)]
    fn mor_count(&self) -> usize {
        match &self.0 {
            DblModelWrapper::Discrete(model) => model.morphisms().count(),
            _ => 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theories::*;

    #[test]
    fn model_schema() {
        let mut model = DblModel::new(&th_schema());
        let x = Uuid::now_v7();
        let y = Uuid::now_v7();
        model.add_ob(ObDecl {
            id: x,
            ob_type: ObType::Basic("entity".into()),
        });
        model.add_ob(ObDecl {
            id: y,
            ob_type: ObType::Basic("attr_type".into()),
        });
        model.add_mor(MorDecl {
            id: Uuid::now_v7(),
            mor_type: MorType::Basic("attr".into()),
            dom: Some(x),
            cod: Some(y),
        });
        assert_eq!(model.ob_count(), 2);
        assert_eq!(model.mor_count(), 1);
        assert!(model.validate().0.is_empty());
    }
}
