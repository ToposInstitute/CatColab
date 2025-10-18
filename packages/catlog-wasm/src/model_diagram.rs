//! Wasm bindings for diagrams in models of a double theory.

use std::rc::Rc;

use all_the_same::all_the_same;
use derive_more::From;
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;
use wasm_bindgen::prelude::*;

use catlog::dbl::model::{DblModel as _, DiscreteDblModel, FgDblModel, MutDblModel};
use catlog::dbl::model_diagram as diagram;
use catlog::dbl::model_morphism::DiscreteDblModelMapping;
use catlog::one::FgCategory;
use catlog::zero::{
    Mapping, MutMapping, NameLookup, NameSegment, Namespace, QualifiedLabel, QualifiedName,
};
use notebook_types::current::*;

use super::model::DblModel;
use super::notation::*;
use super::result::JsResult;
use super::theory::{DblTheory, DblTheoryBox};

/// A box containing a diagram in a model of a double theory.
#[derive(From)]
pub enum DblModelDiagramBox {
    /// A diagram in a model of a discrete double theory.
    Discrete(diagram::DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>),
    // Modal(), # TODO: Not implemented.
}

/// Wasm binding for a diagram in a model of a double theory.
#[wasm_bindgen]
pub struct DblModelDiagram {
    /// The boxed underlying diagram.
    #[wasm_bindgen(skip)]
    pub diagram: DblModelDiagramBox,
    ob_namespace: Namespace,
}

impl DblModelDiagram {
    /// Creates an empty diagram for the given theory.
    pub fn new(theory: &DblTheory) -> Self {
        let diagram = match &theory.0 {
            DblTheoryBox::Discrete(theory) => {
                let mapping = Default::default();
                let model = DiscreteDblModel::new(theory.clone());
                diagram::DblModelDiagram(mapping, model).into()
            }
            _ => panic!("Diagrams only implemented for discrete double theories"),
        };
        Self {
            diagram,
            ob_namespace: Namespace::new_for_uuid(),
        }
    }

    /// Adds an object to the diagram.
    pub fn add_ob(&mut self, decl: &DiagramObDecl) -> Result<(), String> {
        all_the_same!(match &mut self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, model) = diagram.into();
                let ob_type: QualifiedName = Elaborator.elab(&decl.ob_type)?;
                if let Some(over) = decl.over.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    mapping.assign_ob(decl.id.into(), over);
                }
                model.add_ob(decl.id.into(), ob_type);
            }
        });
        if !decl.name.is_empty() {
            self.ob_namespace.set_label(decl.id, decl.name.as_str().into());
        }
        Ok(())
    }

    /// Adds a morphism to the diagram.
    pub fn add_mor(&mut self, decl: &DiagramMorDecl) -> Result<(), String> {
        all_the_same!(match &mut self.diagram {
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
            }
        });
        if decl.name.is_empty() {
            Ok(())
        } else {
            // There's no reason for this, but it's what we're currently doing.
            Err("Indexing morphisms in diagrams cannot be labeled".into())
        }
    }
}

#[wasm_bindgen]
impl DblModelDiagram {
    /// Gets domain of a morphism generator for the diagram's indexing model.
    #[wasm_bindgen(js_name = "getDom")]
    pub fn get_dom(&self, id: &QualifiedName) -> Option<Ob> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                model.get_dom(id).map(|ob| Quoter.quote(ob))
            }
        })
    }

    /// Gets codomain of a morphism generator for the diagram's indexing model.
    #[wasm_bindgen(js_name = "getCod")]
    pub fn get_cod(&self, id: &QualifiedName) -> Option<Ob> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                model.get_cod(id).map(|ob| Quoter.quote(ob))
            }
        })
    }

    /// Gets the object that the given object generator is over.
    #[wasm_bindgen(js_name = "getObOver")]
    pub fn get_ob_over(&self, id: &QualifiedName) -> Option<Ob> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, _) = diagram.into();
                mapping.0.ob_generator_map.apply_to_ref(id).map(|ob| Quoter.quote(&ob))
            }
        })
    }

    /// Gets the morphism that the given morphism generator is over.
    #[wasm_bindgen(js_name = "getMorOver")]
    pub fn get_mor_over(&self, id: &QualifiedName) -> Option<Mor> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, _) = diagram.into();
                mapping.0.mor_generator_map.apply_to_ref(id).map(|mor| Quoter.quote(&mor))
            }
        })
    }

    /// Gets the object type of an object in the diagram's indexing model.
    #[wasm_bindgen(js_name = "obType")]
    pub fn ob_type(&self, ob: Ob) -> Result<ObType, String> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                Ok(Quoter.quote(&model.ob_type(&Elaborator.elab(&ob)?)))
            }
        })
    }

    /// Gets the morphism type of a morphism in the diagram's indexing model.
    #[wasm_bindgen(js_name = "morType")]
    pub fn mor_type(&self, mor: Mor) -> Result<MorType, String> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                Ok(Quoter.quote(&model.mor_type(&Elaborator.elab(&mor)?)))
            }
        })
    }

    /// Returns the object generators for the diagram's indexing model.
    #[wasm_bindgen(js_name = "obGenerators")]
    pub fn ob_generators(&self) -> Vec<QualifiedName> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                model.ob_generators().collect()
            }
        })
    }

    /// Returns the morphism generators for the diagram's indexing model.
    #[wasm_bindgen(js_name = "morGenerators")]
    pub fn mor_generators(&self) -> Vec<QualifiedName> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                model.mor_generators().collect()
            }
        })
    }

    /// Returns the object generators of the given object type.
    #[wasm_bindgen(js_name = "obGeneratorsWithType")]
    pub fn ob_generators_with_type(&self, ob_type: ObType) -> Result<Vec<QualifiedName>, String> {
        all_the_same!(match &self.diagram {
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
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (_, model) = diagram.into();
                let mor_type = Elaborator.elab(&mor_type)?;
                Ok(model.mor_generators_with_type(&mor_type).collect())
            }
        })
    }

    /// Gets the label, if any, for an object generator in the indexing model.
    #[wasm_bindgen(js_name = "obGeneratorLabel")]
    pub fn ob_generator_label(&self, id: &QualifiedName) -> Option<QualifiedLabel> {
        self.ob_namespace.label(id)
    }

    /// Gets an object generator with the given label in the indexing model.
    #[wasm_bindgen(js_name = "obGeneratorWithLabel")]
    pub fn ob_generator_with_label(&self, label: &QualifiedLabel) -> NameLookup {
        self.ob_namespace.name_with_label(label)
    }

    /// Returns array of diagram judgments that would define the diagram.
    #[wasm_bindgen]
    pub fn judgments(&self) -> Vec<DiagramJudgment> {
        let ob_decls = self.ob_declarations().into_iter().map(DiagramJudgment::Object);
        let mor_decls = self.mor_declarations().into_iter().map(DiagramJudgment::Morphism);
        ob_decls.chain(mor_decls).collect()
    }

    /// Returns array of declarations of basic objects.
    fn ob_declarations(&self) -> Vec<DiagramObDecl> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, model) = diagram.into();
                let decls = model.ob_generators().map(|x| {
                    let maybe_label = self.ob_namespace.label(&x);
                    DiagramObDecl {
                        name: maybe_label.map(|label| label.to_string()).unwrap_or_default(),
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
    fn mor_declarations(&self) -> Vec<DiagramMorDecl> {
        all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let (mapping, model) = diagram.into();
                let decls = model.mor_generators().map(|f| {
                    DiagramMorDecl {
                        name: "".into(),
                        id: expect_single_uuid(&f),
                        mor_type: Quoter.quote(&model.mor_generator_type(&f)),
                        over: mapping.0.mor_generator_map.get(&f).map(|mor| Quoter.quote(mor)),
                        dom: model.get_dom(&f).map(|ob| Quoter.quote(ob)),
                        cod: model.get_cod(&f).map(|ob| Quoter.quote(ob)),
                    }
                });
                decls.collect()
            }
        })
    }

    /// Infers missing data in the diagram from the model, where possible.
    #[wasm_bindgen(js_name = "inferMissingFrom")]
    pub fn infer_missing_from(&mut self, model: &DblModel) -> Result<(), String> {
        all_the_same!(match &mut self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let model: &Rc<_> = (&model.model).try_into().map_err(
                    |_| "Type of model should match type of diagram")?;
                diagram.infer_missing_from(model);
            }
        });

        // Assign numbers to anonymous objects added by inference.
        let mut nanon = 0;
        for id in self.ob_generators() {
            if self.ob_namespace.label(&id).is_none() {
                nanon += 1;
                self.ob_namespace.set_label(expect_single_uuid(&id), nanon.into());
            }
        }

        Ok(())
    }

    /// Validates that the diagram is well defined in a model.
    #[wasm_bindgen(js_name = "validateIn")]
    pub fn validate_in(&self, model: &DblModel) -> Result<ModelDiagramValidationResult, String> {
        let result = all_the_same!(match &self.diagram {
            DblModelDiagramBox::[Discrete](diagram) => {
                let model: &Rc<_> = (&model.model).try_into().map_err(
                    |_| "Type of model should match type of diagram")?;
                diagram.validate_in(model)
            }
        });
        Ok(ModelDiagramValidationResult(result.map_err(|errs| errs.into()).into()))
    }
}

/// XXX: We only use this in `DblModelDiagram.judgments`, which probably
/// shouldn't need anyway but is currently used in the Decapodes interop.
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
        let [a, b] = [Uuid::now_v7(), Uuid::now_v7()];
        for (name, indiv, f) in [("x", x, a), ("y", y, b)] {
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
                        id: f,
                        mor_type: MorType::Basic("Attr".into()),
                        dom: Some(Ob::Basic(indiv.to_string())),
                        cod: Some(Ob::Basic(var.to_string())),
                        over: Some(Mor::Basic(attr.to_string())),
                    })
                    .is_ok()
            );
        }
        assert_eq!(diagram.get_dom(&a.into()), Some(Ob::Basic(x.into())));
        assert_eq!(diagram.get_cod(&a.into()), Some(Ob::Basic(var.into())));
        assert_eq!(diagram.get_ob_over(&x.into()), Some(Ob::Basic(entity.into())));
        assert_eq!(diagram.get_mor_over(&a.into()), Some(Mor::Basic(attr.into())));
        assert_eq!(diagram.ob_generator_label(&var.into()), Some("var".into()));
        assert_eq!(diagram.ob_generator_with_label(&"var".into()), NameLookup::Unique(var.into()));
        assert_eq!(diagram.ob_generators().len(), 3);
        assert_eq!(diagram.mor_generators().len(), 2);
        assert_eq!(diagram.judgments().len(), 5);
        assert_eq!(diagram.validate_in(&model).unwrap().0, JsResult::Ok(()));
    }
}
