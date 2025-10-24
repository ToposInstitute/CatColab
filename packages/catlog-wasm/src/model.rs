//! Wasm bindings for models of a double theory.

use std::collections::HashMap;
use std::rc::Rc;

use all_the_same::all_the_same;
use catlog::tt;
use derive_more::{From, TryInto};
use nonempty::NonEmpty;
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use catlog::dbl::model::{
    self as dbl_model, DblModel as _, FgDblModel, InvalidDblModel, ModalMor, ModalOb, MutDblModel,
    TabEdge, TabMor, TabOb,
};
use catlog::dbl::theory::{self as dbl_theory, ModalObOp};
use catlog::one::{Category as _, FgCategory, Path, QualifiedPath};
use catlog::validate::Validate;
use catlog::zero::{NameLookup, Namespace, QualifiedLabel, QualifiedName};
use notebook_types::current::{path as notebook_path, *};

use super::notation::*;
use super::result::JsResult;
use super::theory::{
    DblTheory, DblTheoryBox, demote_modality, expect_single_name, promote_modality,
};

/// Elaborates into an object in a model of a discrete double theory.
impl CanElaborate<Ob, QualifiedName> for Elaborator {
    fn elab(&self, ob: &Ob) -> Result<QualifiedName, String> {
        match ob {
            Ob::Basic(name) => QualifiedName::deserialize_str(name),
            _ => Err(format!("Cannot use object with discrete double theory: {ob:#?}")),
        }
    }
}

/// Elaborates into a morphism in a model of a discrete double theory.
impl CanElaborate<Mor, QualifiedPath> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<QualifiedPath, String> {
        match mor {
            Mor::Basic(name) => Ok(Path::single(QualifiedName::deserialize_str(name)?)),
            Mor::Composite(path) => promote_path(*path.clone())
                .and_then(|path| {
                    path.try_map(|ob| Elaborator.elab(&ob), |mor| Elaborator.elab(&mor))
                })
                .map(|path| path.flatten()),
            _ => Err(format!("Cannot use morphism with discrete double theory: {mor:#?}")),
        }
    }
}

fn promote_path<V, E>(path: notebook_path::Path<V, E>) -> Result<Path<V, E>, String> {
    match path {
        notebook_path::Path::Id(v) => Ok(Path::Id(v)),
        notebook_path::Path::Seq(edges) if !edges.is_empty() => {
            Ok(Path::Seq(NonEmpty::from_vec(edges).unwrap()))
        }
        _ => Err("Sequence of edges in path must be non-empty".into()),
    }
}

/// Elaborates into an object in a model of a discrete tabulator theory.
impl CanElaborate<Ob, TabOb> for Elaborator {
    fn elab(&self, ob: &Ob) -> Result<TabOb, String> {
        match ob {
            Ob::Basic(name) => Ok(TabOb::Basic(QualifiedName::deserialize_str(name)?)),
            Ob::Tabulated(mor) => Ok(TabOb::Tabulated(Box::new(self.elab(mor)?))),
            _ => Err(format!("Cannot use object with discrete tabulator theory: {ob:#?}")),
        }
    }
}

/// Elaborates into a morphism in a model of a discrete tabulator theory.
impl CanElaborate<Mor, TabMor> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<TabMor, String> {
        match mor {
            Mor::Basic(name) => {
                let name = QualifiedName::deserialize_str(name)?;
                Ok(Path::single(dbl_model::TabEdge::Basic(name)))
            }
            Mor::Composite(path) => promote_path(*path.clone())
                .and_then(|path| {
                    path.try_map(|ob| Elaborator.elab(&ob), |mor| Elaborator.elab(&mor))
                })
                .map(|path| path.flatten()),
            Mor::TabulatorSquare {
                dom,
                cod,
                pre,
                post,
            } => Ok(Path::single(dbl_model::TabEdge::Square {
                dom: Box::new(Elaborator.elab(dom.as_ref())?),
                cod: Box::new(Elaborator.elab(cod.as_ref())?),
                pre: Box::new(Elaborator.elab(pre.as_ref())?),
                post: Box::new(Elaborator.elab(post.as_ref())?),
            })),
        }
    }
}

impl CanElaborate<Mor, TabEdge> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<TabEdge, String> {
        match mor {
            Mor::Basic(name) => Ok(TabEdge::Basic(QualifiedName::deserialize_str(name)?)),
            Mor::TabulatorSquare {
                dom,
                cod,
                pre,
                post,
            } => Ok(TabEdge::Square {
                dom: Box::new(Elaborator.elab(dom.as_ref())?),
                cod: Box::new(Elaborator.elab(cod.as_ref())?),
                pre: Box::new(Elaborator.elab(pre.as_ref())?),
                post: Box::new(Elaborator.elab(post.as_ref())?),
            }),
            _ => Err(format!("Cannot cast morphism for discrete tabulator theory: {mor:#?}")),
        }
    }
}

/// Elaborates into an object in a model of a modal theory.
impl CanElaborate<Ob, ModalOb> for Elaborator {
    fn elab(&self, ob: &Ob) -> Result<ModalOb, String> {
        match ob {
            Ob::Basic(name) => Ok(ModalOb::Generator(QualifiedName::deserialize_str(name)?)),
            Ob::App { op, ob } => {
                let op: ModalObOp = self.elab(op)?;
                op.ob_act(self.elab(ob.as_ref())?)
            }
            Ob::List { modality, objects } => {
                let dbl_theory::Modality::List(list_type) = promote_modality(*modality) else {
                    return Err(format!("Expected list modality, received: {modality:#?}"));
                };
                let objects: Result<Vec<_>, _> =
                    objects.iter().filter_map(|ob| ob.as_ref().map(|ob| self.elab(ob))).collect();
                Ok(ModalOb::List(list_type, objects?))
            }
            _ => Err(format!("Cannot use object with modal theory: {ob:#?}")),
        }
    }
}

/// Elaborates into a morphism in a model of a modal theory.
impl CanElaborate<Mor, ModalMor> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<ModalMor, String> {
        match mor {
            Mor::Basic(name) => Ok(ModalMor::Generator(QualifiedName::deserialize_str(name)?)),
            _ => Err(format!("Cannot use morphism with modal theory: {mor:#?}")),
        }
    }
}

/// Quotes an object in a model of a discrete double theory.
impl CanQuote<QualifiedName, Ob> for Quoter {
    fn quote(&self, name: &QualifiedName) -> Ob {
        Ob::Basic(name.serialize_string())
    }
}

/// Quotes a morphism in a model of a discrete double theory.
impl CanQuote<QualifiedPath, Mor> for Quoter {
    fn quote(&self, path: &QualifiedPath) -> Mor {
        let path = path.clone();
        if path.len() == 1 {
            Mor::Basic(path.only().unwrap().serialize_string())
        } else {
            Mor::Composite(Box::new(demote_path(
                path.map(|v| Ob::Basic(v.serialize_string()), |e| Mor::Basic(e.serialize_string())),
            )))
        }
    }
}

fn demote_path<V, E>(path: Path<V, E>) -> notebook_path::Path<V, E> {
    match path {
        Path::Id(v) => notebook_path::Path::Id(v),
        Path::Seq(edges) => notebook_path::Path::Seq(edges.into()),
    }
}

/// Quotes an object in a model of a discrete tabulator theory.
impl CanQuote<TabOb, Ob> for Quoter {
    fn quote(&self, ob: &TabOb) -> Ob {
        match ob {
            TabOb::Basic(name) => Ob::Basic(name.serialize_string()),
            TabOb::Tabulated(path) => Ob::Tabulated(self.quote(path.as_ref())),
        }
    }
}

/// Quotes a morphism in a model of a discrete tabulator theory.
impl CanQuote<TabMor, Mor> for Quoter {
    fn quote(&self, path: &TabMor) -> Mor {
        if path.len() == 1 {
            self.quote(&path.clone().only().unwrap())
        } else {
            Mor::Composite(Box::new(demote_path(
                path.clone().map(|ob| self.quote(&ob), |mor| self.quote(&mor)),
            )))
        }
    }
}

impl CanQuote<TabEdge, Mor> for Quoter {
    fn quote(&self, ob: &TabEdge) -> Mor {
        match ob {
            TabEdge::Basic(name) => Mor::Basic(name.serialize_string()),
            TabEdge::Square {
                dom,
                cod,
                pre,
                post,
            } => Mor::TabulatorSquare {
                dom: Box::new(self.quote(dom.as_ref())),
                cod: Box::new(self.quote(cod.as_ref())),
                pre: Box::new(self.quote(pre.as_ref())),
                post: Box::new(self.quote(post.as_ref())),
            },
        }
    }
}

/// Quotes an object in a modal of a modal theory.
impl CanQuote<ModalOb, Ob> for Quoter {
    fn quote(&self, ob: &ModalOb) -> Ob {
        match ob {
            ModalOb::Generator(name) => Ob::Basic(name.serialize_string()),
            ModalOb::App(ob, th_id) => Ob::App {
                op: ObOp::Basic(expect_single_name(th_id)),
                ob: self.quote(ob.as_ref()).into(),
            },
            ModalOb::List(list_type, objects) => Ob::List {
                modality: demote_modality(dbl_theory::Modality::List(*list_type)),
                objects: objects.iter().map(|ob| Some(self.quote(ob))).collect(),
            },
        }
    }
}

/// Quotes a morphism in a model of a modal theory.
impl CanQuote<ModalMor, Mor> for Quoter {
    fn quote(&self, mor: &ModalMor) -> Mor {
        match mor {
            ModalMor::Generator(name) => Mor::Basic(name.serialize_string()),
            ModalMor::Composite(path) => {
                if path.len() == 1 {
                    self.quote(&path.clone().only().unwrap())
                } else {
                    Mor::Composite(Box::new(demote_path(
                        path.clone().map(|ob| self.quote(&ob), |mor| self.quote(&mor)),
                    )))
                }
            }
            _ => panic!("Variant not implemented for morphism in model of modal theory"),
        }
    }
}

/// A box containing a model of a double theory of any kind.
///
/// See [`DblTheoryBox`] for motivation.
#[derive(Clone, From, TryInto)]
#[try_into(ref)]
pub enum DblModelBox {
    /// A model of a discrete double theory.
    Discrete(Rc<dbl_model::DiscreteDblModel>),
    /// A model of a discrete tabulator theory.
    DiscreteTab(Rc<dbl_model::DiscreteTabModel>),
    /// A model of a modal double theory.
    Modal(Rc<dbl_model::ModalDblModel>),
}

impl From<dbl_model::DiscreteDblModel> for DblModelBox {
    fn from(value: dbl_model::DiscreteDblModel) -> Self {
        Rc::new(value).into()
    }
}
impl From<dbl_model::DiscreteTabModel> for DblModelBox {
    fn from(value: dbl_model::DiscreteTabModel) -> Self {
        Rc::new(value).into()
    }
}
impl From<dbl_model::ModalDblModel> for DblModelBox {
    fn from(value: dbl_model::ModalDblModel) -> Self {
        Rc::new(value).into()
    }
}

impl DblModelBox {
    /// Constructs an empty boxed model of a double theory.
    pub fn new(theory: &DblTheory) -> Self {
        match &theory.0 {
            DblTheoryBox::Discrete(th) => dbl_model::DiscreteDblModel::new(th.clone()).into(),
            DblTheoryBox::DiscreteTab(th) => dbl_model::DiscreteTabModel::new(th.clone()).into(),
            DblTheoryBox::Modal(th) => dbl_model::ModalDblModel::new(th.clone()).into(),
        }
    }
}

/// Wasm binding of a model of a double theory.
#[derive(Clone)]
#[wasm_bindgen]
pub struct DblModel {
    /// The boxed underlying model.
    #[wasm_bindgen(skip)]
    pub model: DblModelBox,
    /// The elaborated type for the model.
    #[wasm_bindgen(skip)]
    pub ty: Option<tt::val::TyV>,
    ob_namespace: Namespace,
    mor_namespace: Namespace,
}

impl DblModel {
    /// Constructs an empty model of a double theory.
    pub fn new(theory: &DblTheory) -> Self {
        Self {
            model: DblModelBox::new(theory),
            ty: None,
            ob_namespace: Namespace::new_for_uuid(),
            mor_namespace: Namespace::new_for_uuid(),
        }
    }

    /// Replaces the boxed model while preserving the namespaces.
    pub fn replace_box(&self, model: DblModelBox) -> Self {
        Self {
            model,
            ty: self.ty.clone(),
            ob_namespace: self.ob_namespace.clone(),
            mor_namespace: self.mor_namespace.clone(),
        }
    }

    /// Tries to get a model of a discrete theory.
    pub fn discrete(&self) -> Result<&Rc<dbl_model::DiscreteDblModel>, String> {
        (&self.model)
            .try_into()
            .map_err(|_| "Model should be of a discrete theory".into())
    }

    /// Tries to get a model of a discrete tabulator theory.
    pub fn discrete_tab(&self) -> Result<&Rc<dbl_model::DiscreteTabModel>, String> {
        (&self.model)
            .try_into()
            .map_err(|_| "Model should be of a discrete tabulator theory".into())
    }

    /// Tries to get a model of a modal theory.
    pub fn modal(&self) -> Result<&Rc<dbl_model::ModalDblModel>, String> {
        (&self.model).try_into().map_err(|_| "Model should be of a modal theory".into())
    }

    /// Adds an object to the model.
    pub fn add_ob(&mut self, decl: &ObDecl) -> Result<(), String> {
        all_the_same!(match &mut self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let model = Rc::make_mut(model);
                let ob_type = Elaborator.elab(&decl.ob_type)?;
                model.add_ob(decl.id.into(), ob_type);
            }
        });
        if !decl.name.is_empty() {
            self.ob_namespace.set_label(decl.id, decl.name.as_str().into())
        }
        Ok(())
    }

    /// Adds a morphism to the model.
    pub fn add_mor(&mut self, decl: &MorDecl) -> Result<(), String> {
        all_the_same!(match &mut self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let model = Rc::make_mut(model);
                let mor_type = Elaborator.elab(&decl.mor_type)?;
                model.make_mor(decl.id.into(), mor_type);
                if let Some(dom) = decl.dom.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    model.set_dom(decl.id.into(), dom);
                }
                if let Some(cod) = decl.cod.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    model.set_cod(decl.id.into(), cod);
                }
            }
        });
        if !decl.name.is_empty() {
            self.mor_namespace.set_label(decl.id, decl.name.as_str().into())
        }
        Ok(())
    }
}

#[wasm_bindgen]
impl DblModel {
    /// Is the object contained in the model?
    #[wasm_bindgen(js_name = "hasOb")]
    pub fn has_ob(&self, ob: Ob) -> Result<bool, String> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let ob = Elaborator.elab(&ob)?;
                Ok(model.has_ob(&ob))
            }
        })
    }

    /// Is the morphism contained in the model?
    #[wasm_bindgen(js_name = "hasMor")]
    pub fn has_mor(&self, mor: Mor) -> Result<bool, String> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let mor = Elaborator.elab(&mor)?;
                Ok(model.has_mor(&mor))
            }
        })
    }

    /// Gets the domain of a morphism in the model.
    #[wasm_bindgen]
    pub fn dom(&self, mor: Mor) -> Result<Ob, String> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let mor = Elaborator.elab(&mor)?;
                Ok(Quoter.quote(&model.dom(&mor)))
            }
        })
    }

    /// Gets the codomain of a morphism in the model.
    #[wasm_bindgen]
    pub fn cod(&self, mor: Mor) -> Result<Ob, String> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let mor = Elaborator.elab(&mor)?;
                Ok(Quoter.quote(&model.cod(&mor)))
            }
        })
    }

    /// Gets the domain of a morphism generator, if it is set.
    #[wasm_bindgen(js_name = "getDom")]
    pub fn get_dom(&self, id: &QualifiedName) -> Result<Option<Ob>, String> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                Ok(model.get_dom(id).map(|ob| Quoter.quote(ob)))
            }
        })
    }

    /// Gets the codomain of a morphism generator, if it is set.
    #[wasm_bindgen(js_name = "getCod")]
    pub fn get_cod(&self, id: &QualifiedName) -> Result<Option<Ob>, String> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                Ok(model.get_cod(id).map(|ob| Quoter.quote(ob)))
            }
        })
    }

    /// Gets the object type of an object in the model.
    #[wasm_bindgen(js_name = "obType")]
    pub fn ob_type(&self, ob: Ob) -> Result<ObType, String> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                Ok(Quoter.quote(&model.ob_type(&Elaborator.elab(&ob)?)))
            }
        })
    }

    /// Gets the morphism type of a morphism in the model.
    #[wasm_bindgen(js_name = "morType")]
    pub fn mor_type(&self, mor: Mor) -> Result<MorType, String> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                Ok(Quoter.quote(&model.mor_type(&Elaborator.elab(&mor)?)))
            }
        })
    }

    /// Returns the object generators for the model.
    #[wasm_bindgen(js_name = "obGenerators")]
    pub fn ob_generators(&self) -> Vec<QualifiedName> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                model.ob_generators().collect()
            }
        })
    }

    /// Returns the morphism generators for the model.
    #[wasm_bindgen(js_name = "morGenerators")]
    pub fn mor_generators(&self) -> Vec<QualifiedName> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                model.mor_generators().collect()
            }
        })
    }

    /// Returns the object generators of the given object type.
    #[wasm_bindgen(js_name = "obGeneratorsWithType")]
    pub fn ob_generators_with_type(&self, ob_type: ObType) -> Result<Vec<QualifiedName>, String> {
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
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
        all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let mor_type = Elaborator.elab(&mor_type)?;
                Ok(model.mor_generators_with_type(&mor_type).collect())
            }
        })
    }

    /// Gets the human-readable label, if any, for an object generator.
    #[wasm_bindgen(js_name = "obGeneratorLabel")]
    pub fn ob_generator_label(&self, id: &QualifiedName) -> Option<QualifiedLabel> {
        self.ob_namespace.label(id)
    }

    /// Gets an object generator with the given human-readable label.
    #[wasm_bindgen(js_name = "obGeneratorWithLabel")]
    pub fn ob_generator_with_label(&self, label: &QualifiedLabel) -> NameLookup {
        self.ob_namespace.name_with_label(label)
    }

    /// Gets the human-readable label, if any, for a morphism generator.
    #[wasm_bindgen(js_name = "morGeneratorLabel")]
    pub fn mor_generator_label(&self, id: &QualifiedName) -> Option<QualifiedLabel> {
        self.mor_namespace.label(id)
    }

    /// Gets a morphism generator with the given human-readable label.
    #[wasm_bindgen(js_name = "morGeneratorWithLabel")]
    pub fn mor_generator_with_label(&self, label: &QualifiedLabel) -> NameLookup {
        self.mor_namespace.name_with_label(label)
    }

    /// Validates the model, returning any validation failures.
    pub fn validate(&self) -> ModelValidationResult {
        let result = all_the_same!(match &self.model {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => model.validate()
        });
        ModelValidationResult(result.map_err(|errs| errs.into()).into())
    }
}

/// Result of validating a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelValidationResult(pub JsResult<(), Vec<InvalidDblModel>>);

/// Collects application of a product operation into a list of objects.
#[wasm_bindgen(js_name = "collectProduct")]
pub fn collect_product(ob: Ob) -> Result<Vec<Ob>, String> {
    let ob: ModalOb = Elaborator.elab(&ob)?;
    let vec = ob.collect_product(None).ok_or("Object is not a product")?;
    Ok(vec.into_iter().map(|ob| Quoter.quote(&ob)).collect())
}

/// A named collection of models of double theories.
#[derive(Default)]
#[wasm_bindgen]
pub struct DblModelMap(#[wasm_bindgen(skip)] pub HashMap<String, DblModel>);

#[wasm_bindgen]
impl DblModelMap {
    /// Constructs an empty collection of models.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Default::default()
    }

    /// Returns whether the collection contains a model with the given name.
    #[wasm_bindgen(js_name = "has")]
    pub fn contains_key(&self, id: &str) -> bool {
        self.0.contains_key(id)
    }

    /// Inserts a model with the given name.
    #[wasm_bindgen(js_name = "set")]
    pub fn insert(&mut self, id: String, model: &DblModel) {
        self.0.insert(id, model.clone());
    }
}

/// Elaborates a model defined by a notebook into a catlog model.
#[wasm_bindgen(js_name = "elaborateModel")]
pub fn elaborate_model(
    notebook: &ModelNotebook,
    instantiated: &DblModelMap,
    theory: &DblTheory,
) -> Result<DblModel, String> {
    let mut model = DblModel::new(theory);
    for judgment in notebook.0.formal_content() {
        match judgment {
            ModelJudgment::Object(decl) => model.add_ob(decl)?,
            ModelJudgment::Morphism(decl) => model.add_mor(decl)?,
            ModelJudgment::Instantiation(_inst) => {
                // legacy elaboration ignores instantiation
            }
        }
    }
    Ok(model)
}

#[cfg(test)]
pub(crate) mod tests {
    use uuid::Uuid;

    use super::*;
    use crate::theories::*;

    pub(crate) fn sch_walking_attr(th: &DblTheory, ids: [Uuid; 3]) -> DblModel {
        let mut model = DblModel::new(th);
        let [attr, entity, attr_type] = ids;
        assert!(
            model
                .add_ob(&ObDecl {
                    name: "entity".into(),
                    id: entity,
                    ob_type: ObType::Basic("Entity".into())
                })
                .is_ok()
        );
        assert!(
            model
                .add_ob(&ObDecl {
                    name: "attr_type".into(),
                    id: attr_type,
                    ob_type: ObType::Basic("AttrType".into())
                })
                .is_ok()
        );
        assert!(
            model
                .add_mor(&MorDecl {
                    name: "attr".into(),
                    id: attr,
                    mor_type: MorType::Basic("Attr".into()),
                    dom: Some(Ob::Basic(entity.to_string())),
                    cod: Some(Ob::Basic(attr_type.to_string())),
                })
                .is_ok()
        );
        model
    }

    #[test]
    fn model_schema() {
        let th = ThSchema::new().theory();
        let [a, x, y] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];
        let model = sch_walking_attr(&th, [a, x, y]);

        let (a_id, a) = (a, Mor::Basic(a.to_string()));
        let (x_id, x, y) = (x, Ob::Basic(x.to_string()), Ob::Basic(y.to_string()));
        assert_eq!(model.has_ob(x.clone()), Ok(true));
        assert_eq!(model.has_mor(a.clone()), Ok(true));
        assert_eq!(model.dom(a.clone()), Ok(x.clone()));
        assert_eq!(model.cod(a.clone()), Ok(y.clone()));
        assert_eq!(model.get_dom(&a_id.into()), Ok(Some(x.clone())));
        assert_eq!(model.get_cod(&a_id.into()), Ok(Some(y.clone())));
        assert_eq!(model.ob_type(x.clone()), Ok(ObType::Basic("Entity".into())));
        assert_eq!(model.mor_type(a.clone()), Ok(MorType::Basic("Attr".into())));
        assert_eq!(model.ob_generators().len(), 2);
        assert_eq!(model.mor_generators().len(), 1);
        assert_eq!(
            model.ob_generators_with_type(ObType::Basic("Entity".into())),
            Ok(vec![x_id.into()])
        );
        assert_eq!(
            model.mor_generators_with_type(MorType::Basic("Attr".into())),
            Ok(vec![a_id.into()])
        );
        assert_eq!(model.ob_generator_label(&x_id.into()), Some("entity".into()));
        assert_eq!(model.mor_generator_label(&a_id.into()), Some("attr".into()));
        assert_eq!(model.validate().0, JsResult::Ok(()));

        let mut model = DblModel::new(&th);
        assert!(
            model
                .add_mor(&MorDecl {
                    name: "a".into(),
                    id: a_id,
                    mor_type: MorType::Basic("Attr".into()),
                    dom: None,
                    cod: Some(y.clone())
                })
                .is_ok()
        );
        assert_eq!(Result::from(model.validate().0).map_err(|errs| errs.len()), Err(2));
    }

    #[test]
    fn model_category_links() {
        let th = ThCategoryLinks::new().theory();
        let mut model = DblModel::new(&th);
        let [f, x, y, link] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];
        assert!(
            model
                .add_ob(&ObDecl {
                    name: "x".into(),
                    id: x,
                    ob_type: ObType::Basic("Object".into())
                })
                .is_ok()
        );
        assert!(
            model
                .add_ob(&ObDecl {
                    name: "y".into(),
                    id: y,
                    ob_type: ObType::Basic("Object".into()),
                })
                .is_ok()
        );
        assert!(
            model
                .add_mor(&MorDecl {
                    name: "f".into(),
                    id: f,
                    mor_type: MorType::Hom(Box::new(ObType::Basic("Object".into()))),
                    dom: Some(Ob::Basic(x.to_string())),
                    cod: Some(Ob::Basic(y.to_string())),
                })
                .is_ok()
        );
        assert!(
            model
                .add_mor(&MorDecl {
                    name: "link".into(),
                    id: link,
                    mor_type: MorType::Basic("Link".into()),
                    dom: Some(Ob::Basic(x.to_string())),
                    cod: Some(Ob::Tabulated(Mor::Basic(f.to_string()))),
                })
                .is_ok()
        );
        assert_eq!(model.ob_generators().len(), 2);
        assert_eq!(model.mor_generators().len(), 2);
        assert_eq!(model.validate().0, JsResult::Ok(()));
    }
}
