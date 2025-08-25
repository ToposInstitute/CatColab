//! Wasm bindings for diagrams in models of a double theory.

use all_the_same::all_the_same;
use derive_more::From;
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;
use wasm_bindgen::prelude::*;

use catlog::dbl::model::{DiscreteDblModel, FgDblModel, MutDblModel};
use catlog::dbl::model_diagram as diagram;
use catlog::dbl::model_morphism::DiscreteDblModelMapping;
use catlog::one::FgCategory;
use catlog::zero::{MutMapping, NameSegment, QualifiedName};
use notebook_types::current::*;

use super::model::{DblModel, DblModelBox};
use super::notation::*;
use super::result::JsResult;
use super::theory::DblTheory;

/// A box containing a diagram in a model of a double theory.
#[derive(From)]
pub enum DblModelDiagramBox {
    /// A diagram in a model of a discrete double theory.
    Discrete(diagram::DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>),
    // DiscreteTab(), # TODO: Not implemented.
}

/// Wasm binding for a diagram in a model of a double theory.
#[wasm_bindgen]
pub struct DblModelDiagram(#[wasm_bindgen(skip)] pub DblModelDiagramBox);

impl DblModelDiagram {
    /// Creates an empty diagram for the given theory.
    pub fn new(theory: &DblTheory) -> Self {
        let model = DblModel::new(theory);
        Self(match model.0 {
            DblModelBox::Discrete(model) => {
                let mapping = Default::default();
                diagram::DblModelDiagram(mapping, model).into()
            }
            _ => panic!("Diagrams only implemented for discrete double theories"),
        })
    }

    /// Adds an object to the diagram.
    pub fn add_ob(&mut self, decl: &DiagramObDecl) -> Result<(), String> {
        all_the_same!(match &mut self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, model) = diagram.into();
                let ob_type: QualifiedName = Elaborator.elab(&decl.ob_type)?;
                if let Some(over) = decl.over.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    mapping.assign_ob(decl.id.into(), over);
                }
                model.add_ob(decl.id.into(), ob_type);
                Ok(())
            }
        })
    }

    /// Adds a morphism to the diagram.
    pub fn add_mor(&mut self, decl: &DiagramMorDecl) -> Result<(), String> {
        all_the_same!(match &mut self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, model) = diagram.into();
                let mor_type = Elaborator.elab(&decl.mor_type)?;
                model.make_mor(decl.id.into(), mor_type);
                if let Some(dom) = decl.dom.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    model.set_dom(decl.id.into(), dom);
                }
                if let Some(cod) = decl.cod.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    model.set_cod(decl.id.into(), cod);
                }
                if let Some(over) = decl.over.as_ref().map(|mor| Elaborator.elab(mor)).transpose()? {
                    mapping.assign_mor(decl.id.into(), over);
                }
                Ok(())
            }
        })
    }
}

#[wasm_bindgen]
impl DblModelDiagram {
    /// Returns the object generators for the diagram's indexing model.
    #[wasm_bindgen(js_name = "obGenerators")]
    pub fn ob_generators(&self) -> Vec<QualifiedName> {
        let mut ob_gens: Vec<_> = all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                model.ob_generators().collect()
            }
        });
        ob_gens.sort();
        ob_gens
    }

    /// Returns the morphism generators for the diagram's indexing model.
    #[wasm_bindgen(js_name = "morGenerators")]
    pub fn mor_generators(&self) -> Vec<QualifiedName> {
        let mut mor_gens: Vec<_> = all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                model.mor_generators().collect()
            }
        });
        mor_gens.sort();
        mor_gens
    }

    /// Returns the object generators of the given object type.
    #[wasm_bindgen(js_name = "obGeneratorsWithType")]
    pub fn ob_generators_with_type(&self, ob_type: ObType) -> Result<Vec<QualifiedName>, String> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                let ob_type = Elaborator.elab(&ob_type)?;
                Ok(model.ob_generators_with_type(&ob_type).collect())
            }
        })
    }

    /// Returns the morphism generators of the given morphism type.
    #[wasm_bindgen(js_name = "morGeneratorsWithType")]
    pub fn mor_generators_with_type(
        &self,
        mor_type: MorType,
    ) -> Result<Vec<QualifiedName>, String> {
        all_the_same!(match &self.0 {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                let mor_type = Elaborator.elab(&mor_type)?;
                Ok(model.mor_generators_with_type(&mor_type).collect())
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
                        name: "".into(),
                        id: expect_single_uuid(&x),
                        ob_type: Quoter.quote(&model.ob_generator_type(&x)),
                        over: mapping.0.ob_generator_map.get(&x).map(|ob| Quoter.quote(ob))
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
                        name: "".into(),
                        id: expect_single_uuid(&f),
                        mor_type: Quoter.quote(&model.mor_generator_type(&f)),
                        over: mapping.0.mor_generator_map.get(&f).map(|mor| Quoter.quote(mor)),
                        dom: model.get_dom(&f).cloned().map(|ob| Quoter.quote(&ob)),
                        cod: model.get_cod(&f).cloned().map(|ob| Quoter.quote(&ob)),
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

/// XXX: We only use this in `object_declarations` and `morphism_declarations`,
/// which we shouldn't need anyway.
fn expect_single_uuid(name: &QualifiedName) -> Uuid {
    match name.only() {
        Some(NameSegment::Uuid(uuid)) => uuid,
        _ => panic!("Only names that are single UUIDs are currently supported in notebook types"),
    }
}

/// Result of validating a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelDiagramValidationResult(
    pub JsResult<(), Vec<diagram::InvalidDiscreteDblModelDiagram>>,
);

/// Elaborates a diagram defined by a notebook into a catlog diagram.
#[wasm_bindgen(js_name = "elaborateDiagram")]
pub fn elaborate_diagram(
    judgments: Vec<DiagramJudgment>,
    theory: &DblTheory,
) -> Result<DblModelDiagram, String> {
    let mut diagram = DblModelDiagram::new(theory);
    for judgment in judgments {
        match judgment {
            DiagramJudgment::Object(decl) => diagram.add_ob(&decl)?,
            DiagramJudgment::Morphism(decl) => diagram.add_mor(&decl)?,
        }
    }
    Ok(diagram)
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

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
        assert!(
            diagram
                .add_ob(&DiagramObDecl {
                    name: "var".into(),
                    id: var,
                    ob_type: ObType::Basic("AttrType".into()),
                    over: Some(Ob::Basic(attr_type.to_string()))
                })
                .is_ok()
        );
        for (name, indiv) in [("x", x), ("y", y)] {
            assert!(
                diagram
                    .add_ob(&DiagramObDecl {
                        name: name.into(),
                        id: indiv,
                        ob_type: ObType::Basic("Entity".into()),
                        over: Some(Ob::Basic(entity.to_string())),
                    })
                    .is_ok()
            );
            assert!(
                diagram
                    .add_mor(&DiagramMorDecl {
                        name: "".into(),
                        id: Uuid::now_v7(),
                        mor_type: MorType::Basic("Attr".into()),
                        dom: Some(Ob::Basic(indiv.to_string())),
                        cod: Some(Ob::Basic(var.to_string())),
                        over: Some(Mor::Basic(attr.to_string())),
                    })
                    .is_ok()
            );
        }
        assert_eq!(diagram.ob_generators().len(), 3);
        assert_eq!(diagram.object_declarations().len(), 3);
        assert_eq!(diagram.mor_generators().len(), 2);
        assert_eq!(diagram.morphism_declarations().len(), 2);
        assert_eq!(diagram.validate_in(&model).unwrap().0, JsResult::Ok(()));
    }
}
