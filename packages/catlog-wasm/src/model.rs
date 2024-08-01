//! Wasm bindings for models of double theories.

use uuid::Uuid;

use serde::{Deserialize, Serialize};
use tsify_next::{declare, Tsify};
use wasm_bindgen::prelude::*;

use super::theory::*;
use catlog::dbl::model::{self as dbl_model, InvalidDiscreteDblModel};
use catlog::one::fin_category::UstrFinCategory;
use catlog::validate::{self, Validate};

/// Identifier of object in model of double theory.
#[declare]
pub type ObId = Uuid;

/// Identifier of morphism in model of double theory.
#[declare]
pub type MorId = Uuid;

/// Declaration of object in model of double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct ObDecl {
    /// Globally unique identifier of object.
    pub id: ObId,

    /// Object type in double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,
}

/// Declaration of morphism in model of double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MorDecl {
    /// Globally unique identifier of morphism.
    pub id: MorId,

    /// Morphism type in double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Domain of morphism, if defined.
    pub dom: Option<ObId>,

    /// Codomain of morphism, if defined.
    pub cod: Option<ObId>,
}

/// Wasm bindings for validation errors in a model of a discrete double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiscreteDblModelErrors(Vec<InvalidDiscreteDblModel<Uuid>>);

type UuidDiscreteDblModel = dbl_model::DiscreteDblModel<Uuid, UstrFinCategory>;

/// Wasm bindings for a model of a discrete double theory.
#[wasm_bindgen]
pub struct DiscreteDblModel(UuidDiscreteDblModel);

#[wasm_bindgen]
impl DiscreteDblModel {
    /// Creates an empty model of the given theory.
    #[wasm_bindgen(constructor)]
    pub fn new(theory: &DblTheory) -> Self {
        let th = match &theory.theory {
            DblTheoryWrapper::Discrete(th) => th.clone(),
            DblTheoryWrapper::DiscreteTab(_) => {
                panic!("Models of discrete tabulator theories not implemented")
            }
        };
        Self(UuidDiscreteDblModel::new(th))
    }

    /// Adds an object to the model.
    #[wasm_bindgen(js_name = "addOb")]
    pub fn add_ob(&mut self, decl: ObDecl) {
        // FIXME: Don't just unwrap.
        let ob_type = decl.ob_type.try_into().unwrap();
        self.0.add_ob(decl.id, ob_type);
    }

    /// Adds a morphism to the model.
    #[wasm_bindgen(js_name = "addMor")]
    pub fn add_mor(&mut self, decl: MorDecl) {
        // FIXME: Don't just unwrap.
        let mor_type = decl.mor_type.try_into().unwrap();
        self.0.make_mor(decl.id, mor_type);
        self.0.update_dom(decl.id, decl.dom);
        self.0.update_cod(decl.id, decl.cod);
    }

    #[wasm_bindgen]
    pub fn validate(&self) -> DiscreteDblModelErrors {
        DiscreteDblModelErrors(validate::unwrap_errors(self.0.validate()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theories::*;
    use catlog::dbl::model::DblModel;

    #[test]
    fn model_schema() {
        let mut model = DiscreteDblModel::new(&th_schema());
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
        assert_eq!(model.0.objects().count(), 2);
        assert_eq!(model.0.morphisms().count(), 1);
        assert!(model.validate().0.is_empty());
    }
}
