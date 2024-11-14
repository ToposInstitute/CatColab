//! Wasm bindings for diagrams in models of a double theory.

use all_the_same::all_the_same;
use derive_more::From;
use uuid::Uuid;

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use catlog::dbl::model_diagram as diagram;
use catlog::dbl::model_morphism::InvalidDblModelMorphism;
use catlog::one::FgCategory;
use catlog::validate;

use super::model::{DblModel, DblModelBox, DiscreteDblModel, Mor, Ob};
use super::model_morphism::DiscreteDblModelMapping;
use super::theory::{DblTheory, MorType, ObType};

/// Declares an object of a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct DiagramObDecl {
    /// Globally unique identifier of object.
    pub id: Uuid,

    /// The object's type in the double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,

    /// Object in the model that this object is over, if defined.
    pub over: Option<Ob>,
}

/// Declares a morphism of a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct DiagramMorDecl {
    /// Globally unique identifier of morphism.
    pub id: Uuid,

    /// The morphism's type in the double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Morphism in the model that this morphism is over, if defined.
    pub over: Option<Mor>,

    /// Domain of this morphism, if defined.
    pub dom: Option<Ob>,

    /// Codomain of this morphism, if defined.
    pub cod: Option<Ob>,
}

/// A box containing a diagram in a model of a double theory.
#[derive(From)]
pub enum DblModelDiagramBox {
    Discrete(diagram::DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>),
}

/// Wasm bindings for a diagram in a model of a double theory.
#[wasm_bindgen]
pub struct DblModelDiagram(#[wasm_bindgen(skip)] pub DblModelDiagramBox);

#[wasm_bindgen]
impl DblModelDiagram {
    /// Creates an empty diagram for the given theory.
    #[wasm_bindgen(constructor)]
    pub fn new(theory: &DblTheory) -> Self {
        let model = DblModel::new(theory);
        Self(all_the_same!(match model.0 {
            DblModelBox::[Discrete](model) => {
                let mapping = Default::default();
                diagram::DblModelDiagram(mapping, model).into()
            }
        }))
    }

    /// Adds an object to the diagram.
    #[wasm_bindgen(js_name = "addOb")]
    pub fn add_ob(&mut self, decl: DiagramObDecl) -> Result<bool, String> {
        all_the_same!(match &mut self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, model) = diagram.into();
                let ob_type = decl.ob_type.try_into()?;
                if let Some(over) = decl.over.map(|ob| ob.try_into()).transpose()? {
                    mapping.assign_ob(decl.id, over);
                }
                Ok(model.add_ob(decl.id, ob_type))
            }
        })
    }

    /// Adds a morphism to the diagram.
    #[wasm_bindgen(js_name = "addMor")]
    pub fn add_mor(&mut self, decl: DiagramMorDecl) -> Result<bool, String> {
        all_the_same!(match &mut self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, model) = diagram.into();
                let mor_type = decl.mor_type.try_into()?;
                let res = model.make_mor(decl.id, mor_type);
                if let Some(dom) = decl.dom.map(|ob| ob.try_into()).transpose()? {
                    model.set_dom(decl.id, dom);
                }
                if let Some(cod) = decl.cod.map(|ob| ob.try_into()).transpose()? {
                    model.set_cod(decl.id, cod);
                }
                if let Some(over) = decl.over.map(|mor| mor.try_into()).transpose()? {
                    mapping.assign_basic_mor(decl.id, over);
                }
                Ok(res)
            }
        })
    }

    /// Returns array of all basic objects in the diagram.
    #[wasm_bindgen]
    pub fn objects(&self) -> Vec<Ob> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                model.object_generators().map(|x| x.into()).collect()
            }
        })
    }

    /// Returns array of all basic morphisms in the diagram.
    #[wasm_bindgen]
    pub fn morphisms(&self) -> Vec<Mor> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                model.morphism_generators().map(Mor::Basic).collect()
            }
        })
    }

    /// Validates that the diagram is well defined in a model.
    #[wasm_bindgen]
    pub fn validate_in(
        &self,
        model: &DblModel,
    ) -> Result<Vec<InvalidDblModelMorphism<Uuid, Uuid>>, String> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let model = (&model.0).try_into().map_err(
                    |_| "Type of model should match type of diagram")?;
                Ok(validate::unwrap_errors(diagram.validate_in(model)))
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::tests::sch_walking_attr;
    use crate::theories::*;

    #[test]
    fn diagram_schema() {
        let th = ThSchema::new().theory();
        let [attr, entity, attr_type] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];
        let model = sch_walking_attr(&th, [attr, entity, attr_type]);

        let mut diagram = DblModelDiagram::new(&th);
        let [x, y, var] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];
        assert!(diagram
            .add_ob(DiagramObDecl {
                id: var,
                ob_type: ObType::Basic("AttrType".into()),
                over: Some(Ob::Basic(attr_type))
            })
            .is_ok());
        for indiv in [x, y] {
            assert!(diagram
                .add_ob(DiagramObDecl {
                    id: indiv,
                    ob_type: ObType::Basic("Entity".into()),
                    over: Some(Ob::Basic(entity))
                })
                .is_ok());
            assert!(diagram
                .add_mor(DiagramMorDecl {
                    id: Uuid::now_v7(),
                    mor_type: MorType::Basic("Attr".into()),
                    dom: Some(Ob::Basic(indiv)),
                    cod: Some(Ob::Basic(var)),
                    over: Some(Mor::Basic(attr)),
                })
                .is_ok());
        }
        assert_eq!(diagram.objects().len(), 3);
        assert_eq!(diagram.morphisms().len(), 2);
        assert!(diagram.validate_in(&model).is_ok());
    }
}
