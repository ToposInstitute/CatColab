//! Wasm bindings for diagrams in models of a double theory.

use all_the_same::all_the_same;
use derive_more::From;
use uuid::Uuid;

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use catlog::dbl::model::FgDblModel;
use catlog::dbl::model_diagram as diagram;
use catlog::dbl::model_morphism::DblModelMapping;
use catlog::one::FgCategory;

use super::model::{DblModel, DblModelBox, DiscreteDblModel, Mor, Ob};
use super::model_morphism::DiscreteDblModelMapping;
use super::result::JsResult;
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
                model.objects().map(|x| x.into()).collect()
            }
        })
    }

    /// Returns array of all basic morphisms in the diagram.
    #[wasm_bindgen]
    pub fn morphisms(&self) -> Vec<Mor> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                model.morphisms().map(|f| f.into()).collect()
            }
        })
    }

    /// Returns array of basic objects with the given type.
    #[wasm_bindgen(js_name = "objectsWithType")]
    pub fn objects_with_type(&self, ob_type: ObType) -> Result<Vec<Ob>, String> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                let ob_type = ob_type.try_into()?;
                Ok(model.objects_with_type(&ob_type).map(|x| x.into()).collect())
            }
        })
    }

    /// Returns array of basic morphisms with the given type.
    #[wasm_bindgen(js_name = "morphismsWithType")]
    pub fn morphisms_with_type(&self, mor_type: MorType) -> Result<Vec<Mor>, String> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                let mor_type = mor_type.try_into()?;
                Ok(model.morphisms_with_type(&mor_type).map(|f| f.into()).collect())
            }
        })
    }

    /// Returns array of declarations of basic objects.
    #[wasm_bindgen(js_name = "objectDeclarations")]
    pub fn object_declarations(&self) -> Vec<DiagramObDecl> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, model) = diagram.into();
                let decls = model.ob_generators().map(|x| {
                    DiagramObDecl {
                        id: x,
                        ob_type: model.ob_generator_type(&x).into(),
                        over: mapping.apply_ob(&x).map(|ob| ob.into())
                    }
                });
                decls.collect()
            }
        })
    }

    /// Returns array of declarations of basic morphisms.
    #[wasm_bindgen(js_name = "morphismDeclarations")]
    pub fn morphism_declarations(&self) -> Vec<DiagramMorDecl> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, model) = diagram.into();
                let decls = model.mor_generators().map(|f| {
                    DiagramMorDecl {
                        id: f,
                        mor_type: model.mor_generator_type(&f).into(),
                        over: mapping.apply_basic_mor(&f).map(|mor| mor.into()),
                        dom: model.get_dom(&f).cloned().map(|ob| ob.into()),
                        cod: model.get_cod(&f).cloned().map(|ob| ob.into()),
                    }
                });
                decls.collect()
            }
        })
    }

    /// Infers missing data in the diagram from the model, where possible.
    #[wasm_bindgen(js_name = "inferMissingFrom")]
    pub fn infer_missing_from(&mut self, model: &DblModel) -> Result<(), String> {
        all_the_same!(match &mut self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let model = (&model.0).try_into().map_err(
                    |_| "Type of model should match type of diagram")?;
                diagram.infer_missing_from(model);
                Ok(())
            }
        })
    }

    /// Validates that the diagram is well defined in a model.
    #[wasm_bindgen(js_name = "validateIn")]
    pub fn validate_in(&self, model: &DblModel) -> Result<ModelDiagramValidationResult, String> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let model = (&model.0).try_into().map_err(
                    |_| "Type of model should match type of diagram")?;
                let res = diagram.validate_in(model);
                Ok(ModelDiagramValidationResult(res.map_err(|errs| errs.into()).into()))
            }
        })
    }
}

/// Result of validating a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelDiagramValidationResult(
    pub JsResult<(), Vec<diagram::InvalidDiscreteDblModelDiagram<Uuid>>>,
);

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
        assert_eq!(diagram.object_declarations().len(), 3);
        assert_eq!(diagram.morphisms().len(), 2);
        assert_eq!(diagram.morphism_declarations().len(), 2);
        assert_eq!(diagram.validate_in(&model).unwrap().0, JsResult::Ok(()));
    }
}
