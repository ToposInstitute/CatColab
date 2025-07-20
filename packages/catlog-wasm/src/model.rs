use std::hash::BuildHasherDefault;

use all_the_same::all_the_same;
use derive_more::{From, TryInto};
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use ustr::{IdentityHasher, Ustr};
use uuid::Uuid;
use wasm_bindgen::prelude::*;

use catlog::dbl::model::{
    self as dbl_model, FgDblModel, InvalidDblModel, ModalMor, ModalOb, MutDblModel, TabEdge,
    TabMor, TabOb,
};
use catlog::dbl::theory::{self as dbl_theory, ModalObOp};
use catlog::one::{Category as _, FgCategory, Path, fp_category::UstrFpCategory};
use catlog::validate::Validate;
use notebook_types::current::{path as notebook_path, *};

use super::notation::*;
use super::result::JsResult;
use super::theory::{DblTheory, DblTheoryBox, demote_modality, promote_modality};

pub(crate) type DiscreteDblModel = dbl_model::DiscreteDblModel<Uuid, UstrFpCategory>;
pub(crate) type DiscreteTabModel =
    dbl_model::DiscreteTabModel<Uuid, Ustr, BuildHasherDefault<IdentityHasher>>;
pub(crate) type ModalDblModel =
    dbl_model::ModalDblModel<Uuid, Ustr, BuildHasherDefault<IdentityHasher>>;

/** A box containing a model of a double theory of any kind.

See [`DblTheoryBox`] for motivation.
 */
#[allow(clippy::large_enum_variant)]
#[derive(From, TryInto)]
#[try_into(ref)]
pub enum DblModelBox {
    Discrete(DiscreteDblModel),
    DiscreteTab(DiscreteTabModel),
    Modal(ModalDblModel),
}

#[wasm_bindgen]
pub struct DblModel(#[wasm_bindgen(skip)] pub DblModelBox);

/// Elaborates into an object in a model of a discrete double theory.
impl CanElaborate<Ob, Uuid> for Elaborator {
    fn elab(&self, ob: &Ob) -> Result<Uuid, String> {
        match ob {
            Ob::Basic(uuid) => Ok(*uuid),
            _ => Err(format!("Cannot use object with discrete double theory: {ob:#?}")),
        }
    }
}

/// Elaborates into a morphism in a model of a discrete double theory.
impl CanElaborate<Mor, Path<Uuid, Uuid>> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<Path<Uuid, Uuid>, String> {
        match mor {
            Mor::Basic(id) => Ok(Path::single(*id)),
            Mor::Composite(path) => {
                let result_path = promote_path(*path.clone())
                    .try_map(|ob| Elaborator.elab(&ob), |mor| Elaborator.elab(&mor));
                result_path.map(|path| path.flatten())
            }
            _ => Err(format!("Cannot use morphism with discrete double theory: {mor:#?}")),
        }
    }
}

fn promote_path<V, E>(path: notebook_path::Path<V, E>) -> Path<V, E> {
    match path {
        notebook_path::Path::Id(v) => Path::Id(v),
        notebook_path::Path::Seq(edges) => Path::Seq(edges),
    }
}

/// Elaborates into an object in a model of a discrete tabulator theory.
impl CanElaborate<Ob, TabOb<Uuid, Uuid>> for Elaborator {
    fn elab(&self, ob: &Ob) -> Result<TabOb<Uuid, Uuid>, String> {
        match ob {
            Ob::Basic(id) => Ok(TabOb::Basic(*id)),
            Ob::Tabulated(mor) => Ok(TabOb::Tabulated(Box::new(self.elab(mor)?))),
            _ => Err(format!("Cannot use object with discrete tabulator theory: {ob:#?}")),
        }
    }
}

/// Elaborates into a morphism in a model of a discrete tabulator theory.
impl CanElaborate<Mor, TabMor<Uuid, Uuid>> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<TabMor<Uuid, Uuid>, String> {
        match mor {
            Mor::Basic(id) => Ok(Path::single(dbl_model::TabEdge::Basic(*id))),
            Mor::Composite(path) => {
                let result_path = promote_path(*path.clone())
                    .try_map(|ob| Elaborator.elab(&ob), |mor| Elaborator.elab(&mor));
                result_path.map(|path| path.flatten())
            }
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

impl CanElaborate<Mor, TabEdge<Uuid, Uuid>> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<TabEdge<Uuid, Uuid>, String> {
        match mor {
            Mor::Basic(uuid) => Ok(TabEdge::Basic(*uuid)),
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
impl CanElaborate<Ob, ModalOb<Uuid, Ustr>> for Elaborator {
    fn elab(&self, ob: &Ob) -> Result<ModalOb<Uuid, Ustr>, String> {
        match ob {
            Ob::Basic(id) => Ok(ModalOb::Generator(*id)),
            Ob::App { op, ob } => {
                let op: ModalObOp<_> = self.elab(op)?;
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
impl CanElaborate<Mor, ModalMor<Uuid, Ustr>> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<ModalMor<Uuid, Ustr>, String> {
        match mor {
            Mor::Basic(id) => Ok(ModalMor::Generator(*id)),
            _ => Err(format!("Cannot use morphism with modal theory: {mor:#?}")),
        }
    }
}

/// Quotes an object in a model of a discrete double theory.
impl CanQuote<Uuid, Ob> for Quoter {
    fn quote(&self, id: &Uuid) -> Ob {
        Ob::Basic(*id)
    }
}

/// Quotes a morphism in a model of a discrete double theory.
impl CanQuote<Path<Uuid, Uuid>, Mor> for Quoter {
    fn quote(&self, path: &Path<Uuid, Uuid>) -> Mor {
        if path.len() == 1 {
            Mor::Basic(path.clone().only().unwrap())
        } else {
            Mor::Composite(Box::new(demote_path(path.clone().map(Ob::Basic, Mor::Basic))))
        }
    }
}

fn demote_path<V, E>(path: Path<V, E>) -> notebook_path::Path<V, E> {
    match path {
        Path::Id(v) => notebook_path::Path::Id(v),
        Path::Seq(edges) => notebook_path::Path::Seq(edges),
    }
}

/// Quotes an object in a model of a discrete tabulator theory.
impl CanQuote<TabOb<Uuid, Uuid>, Ob> for Quoter {
    fn quote(&self, ob: &TabOb<Uuid, Uuid>) -> Ob {
        match ob {
            TabOb::Basic(id) => Ob::Basic(*id),
            TabOb::Tabulated(path) => Ob::Tabulated(self.quote(path.as_ref())),
        }
    }
}

/// Quotes a morphism in a model of a discrete tabulator theory.
impl CanQuote<TabMor<Uuid, Uuid>, Mor> for Quoter {
    fn quote(&self, path: &TabMor<Uuid, Uuid>) -> Mor {
        if path.len() == 1 {
            self.quote(&path.clone().only().unwrap())
        } else {
            Mor::Composite(Box::new(demote_path(
                path.clone().map(|ob| self.quote(&ob), |mor| self.quote(&mor)),
            )))
        }
    }
}

impl CanQuote<TabEdge<Uuid, Uuid>, Mor> for Quoter {
    fn quote(&self, ob: &TabEdge<Uuid, Uuid>) -> Mor {
        match ob {
            TabEdge::Basic(id) => Mor::Basic(*id),
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
impl CanQuote<ModalOb<Uuid, Ustr>, Ob> for Quoter {
    fn quote(&self, ob: &ModalOb<Uuid, Ustr>) -> Ob {
        match ob {
            ModalOb::Generator(id) => Ob::Basic(*id),
            ModalOb::App(ob, th_id) => Ob::App {
                op: ObOp::Basic(*th_id),
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
impl CanQuote<ModalMor<Uuid, Ustr>, Mor> for Quoter {
    fn quote(&self, mor: &ModalMor<Uuid, Ustr>) -> Mor {
        match mor {
            ModalMor::Generator(id) => Mor::Basic(*id),
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

impl DblModel {
    pub fn new(theory: &DblTheory) -> Self {
        Self(match &theory.0 {
            DblTheoryBox::Discrete(th) => DiscreteDblModel::new(th.clone()).into(),
            DblTheoryBox::DiscreteTab(th) => DiscreteTabModel::new(th.clone()).into(),
            DblTheoryBox::Modal(th) => ModalDblModel::new(th.clone()).into(),
        })
    }

    pub fn add_ob(&mut self, decl: &ObDecl) -> Result<(), String> {
        all_the_same!(match &mut self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let ob_type = Elaborator.elab(&decl.ob_type)?;
                model.add_ob(decl.id, ob_type);
                Ok(())
            }
        })
    }

    pub fn add_mor(&mut self, decl: &MorDecl) -> Result<(), String> {
        all_the_same!(match &mut self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let mor_type = Elaborator.elab(&decl.mor_type)?;
                model.make_mor(decl.id, mor_type);
                if let Some(dom) = decl.dom.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    model.set_dom(decl.id, dom);
                }
                if let Some(cod) = decl.cod.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    model.set_cod(decl.id, cod);
                }
                Ok(())
            }
        })
    }
}

#[wasm_bindgen]
impl DblModel {
    /// Is the object contained in the model?
    #[wasm_bindgen(js_name = "hasOb")]
    pub fn has_ob(&self, ob: Ob) -> Result<bool, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let ob = Elaborator.elab(&ob)?;
                Ok(model.has_ob(&ob))
            }
        })
    }

    /// Is the morphism contained in the model?
    #[wasm_bindgen(js_name = "hasMor")]
    pub fn has_mor(&self, mor: Mor) -> Result<bool, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let mor = Elaborator.elab(&mor)?;
                Ok(model.has_mor(&mor))
            }
        })
    }

    /// Gets the domain of a morphism in the model.
    #[wasm_bindgen]
    pub fn dom(&self, mor: Mor) -> Result<Ob, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let mor = Elaborator.elab(&mor)?;
                Ok(Quoter.quote(&model.dom(&mor)))
            }
        })
    }

    /// Gets the codomain of a morphism in the model.
    #[wasm_bindgen]
    pub fn cod(&self, mor: Mor) -> Result<Ob, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let mor = Elaborator.elab(&mor)?;
                Ok(Quoter.quote(&model.cod(&mor)))
            }
        })
    }

    /// Gets the domain of a basic morphism, if it is set.
    #[wasm_bindgen(js_name = "getDom")]
    pub fn get_dom(&self, id: &str) -> Result<Option<Ob>, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let id = Uuid::try_parse(id).map_err(|err| err.to_string())?;
                Ok(model.get_dom(&id).map(|ob| Quoter.quote(ob)))
            }
        })
    }

    /// Gets the codomain of a basic morphism, if it is set.
    #[wasm_bindgen(js_name = "getCod")]
    pub fn get_cod(&self, id: &str) -> Result<Option<Ob>, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let id = Uuid::try_parse(id).map_err(|err| err.to_string())?;
                Ok(model.get_cod(&id).map(|ob| Quoter.quote(ob)))
            }
        })
    }

    /// Returns array of all basic objects in the model.
    #[wasm_bindgen]
    pub fn objects(&self) -> Vec<Ob> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                model.objects().map(|x| Quoter.quote(&x)).collect()
            }
        })
    }

    /// Returns array of all basic morphisms in the model.
    #[wasm_bindgen]
    pub fn morphisms(&self) -> Vec<Mor> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                model.morphisms().map(|f| Quoter.quote(&f)).collect()
            }
        })
    }

    /// Returns array of basic objects with the given type.
    #[wasm_bindgen(js_name = "objectsWithType")]
    pub fn objects_with_type(&self, ob_type: ObType) -> Result<Vec<Ob>, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let ob_type = Elaborator.elab(&ob_type)?;
                Ok(model.objects_with_type(&ob_type).map(|ob| Quoter.quote(&ob)).collect())
            }
        })
    }

    /// Returns array of basic morphisms with the given type.
    #[wasm_bindgen(js_name = "morphismsWithType")]
    pub fn morphisms_with_type(&self, mor_type: MorType) -> Result<Vec<Mor>, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let mor_type = Elaborator.elab(&mor_type)?;
                Ok(model.morphisms_with_type(&mor_type).map(|mor| Quoter.quote(&mor)).collect())
            }
        })
    }

    pub fn validate(&self) -> ModelValidationResult {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab, Modal](model) => {
                let res = model.validate();
                ModelValidationResult(res.map_err(|errs| errs.into()).into())
            }
        })
    }
}

/// Result of validating a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelValidationResult(pub JsResult<(), Vec<InvalidDblModel<Uuid>>>);

/// Collects application of a product operation into a list of objects.
#[wasm_bindgen(js_name = "collectProduct")]
pub fn collect_product(ob: Ob) -> Result<Vec<Ob>, String> {
    let ob: ModalOb<_, _> = Elaborator.elab(&ob)?;
    let vec = ob.collect_product(None).ok_or("Object is not a product")?;
    Ok(vec.into_iter().map(|ob| Quoter.quote(&ob)).collect())
}

#[wasm_bindgen(js_name = "elaborateModel")]
pub fn elaborate_model(doc: &ModelDocumentContent, theory: &DblTheory) -> DblModel {
    let mut model = DblModel::new(theory);
    for cell in doc.notebook.cells.iter() {
        if let Cell::Formal { id: _, content } = cell {
            match content {
                ModelJudgment::Object(decl) => model.add_ob(decl).unwrap(),
                ModelJudgment::Morphism(decl) => model.add_mor(decl).unwrap(),
            }
        }
    }
    model
}

#[cfg(test)]
pub(crate) mod tests {
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
                    dom: Some(Ob::Basic(entity)),
                    cod: Some(Ob::Basic(attr_type)),
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

        assert_eq!(model.has_ob(Ob::Basic(x)), Ok(true));
        assert_eq!(model.has_mor(Mor::Basic(a)), Ok(true));
        assert_eq!(model.dom(Mor::Basic(a)), Ok(Ob::Basic(x)));
        assert_eq!(model.cod(Mor::Basic(a)), Ok(Ob::Basic(y)));
        assert_eq!(model.get_dom(&a.to_string()), Ok(Some(Ob::Basic(x))));
        assert_eq!(model.get_cod(&a.to_string()), Ok(Some(Ob::Basic(y))));
        assert_eq!(model.objects().len(), 2);
        assert_eq!(model.morphisms().len(), 1);
        assert_eq!(model.objects_with_type(ObType::Basic("Entity".into())), Ok(vec![Ob::Basic(x)]));
        assert_eq!(
            model.morphisms_with_type(MorType::Basic("Attr".into())),
            Ok(vec![Mor::Basic(a)])
        );
        assert_eq!(model.validate().0, JsResult::Ok(()));

        let mut model = DblModel::new(&th);
        assert!(
            model
                .add_mor(&MorDecl {
                    name: "a".into(),
                    id: a,
                    mor_type: MorType::Basic("Attr".into()),
                    dom: None,
                    cod: Some(Ob::Basic(y)),
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
                    dom: Some(Ob::Basic(x)),
                    cod: Some(Ob::Basic(y)),
                })
                .is_ok()
        );
        assert!(
            model
                .add_mor(&MorDecl {
                    name: "link".into(),
                    id: link,
                    mor_type: MorType::Basic("Link".into()),
                    dom: Some(Ob::Basic(x)),
                    cod: Some(Ob::Tabulated(Mor::Basic(f))),
                })
                .is_ok()
        );
        assert_eq!(model.objects().len(), 2);
        assert_eq!(model.morphisms().len(), 2);
        assert_eq!(model.validate().0, JsResult::Ok(()));
    }
}
