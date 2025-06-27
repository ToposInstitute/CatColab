use std::collections::HashMap;
use std::hash::BuildHasherDefault;

use all_the_same::all_the_same;
use derive_more::{From, TryInto};
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use ustr::{IdentityHasher, Ustr};
use uuid::Uuid;
use wasm_bindgen::prelude::*;

use catlog::dbl::{
    model::{self as dbl_model, FgDblModel, InvalidDblModel, MutDblModel, TabEdge, TabMor, TabOb},
    theory::{TabMorType, TabObType},
};
use catlog::one::{Category as _, FgCategory, Path, fp_category::UstrFpCategory};
use catlog::validate::Validate;
use notebook_types::current::{path as notebook_path, *};

use super::result::JsResult;
use super::theory::{DblTheory, DblTheoryBox};

pub(crate) type DiscreteDblModel = dbl_model::DiscreteDblModel<Uuid, UstrFpCategory>;
pub(crate) type DiscreteTabModel =
    dbl_model::DiscreteTabModel<Uuid, Ustr, BuildHasherDefault<IdentityHasher>>;

/** A box containing a model of a double theory of any kind.

See [`DblTheoryBox`] for motivation.
 */
#[allow(clippy::large_enum_variant)]
#[derive(From, TryInto)]
#[try_into(ref)]
pub enum DblModelBox {
    Discrete(DiscreteDblModel),
    DiscreteTab(DiscreteTabModel),
}

#[wasm_bindgen]
pub struct DblModel(#[wasm_bindgen(skip)] pub DblModelBox);

/** Elaboration is the process of transforming notation (as declared in
notebook-types) into syntax and values. This can possibly fail. Eventually,
this struct may have some role to play in accumulating errors, but for now it is
a singleton. */
pub struct Elaborator;

pub trait CanElaborate<T, S> {
    fn elab(&self, x: &T) -> Result<S, String>;
}

impl CanElaborate<ObType, Ustr> for Elaborator {
    fn elab(&self, x: &ObType) -> Result<Ustr, String> {
        match x {
            ObType::Basic(name) => Ok(*name),
            _ => Err(format!("Cannot cast object type for discrete double theory: {x:#?}")),
        }
    }
}

impl CanElaborate<ObType, TabObType<Ustr, Ustr>> for Elaborator {
    fn elab(&self, x: &ObType) -> Result<TabObType<Ustr, Ustr>, String> {
        match x {
            ObType::Basic(name) => Ok(TabObType::Basic(*name)),
            ObType::Tabulator(mor_type) => {
                Ok(TabObType::Tabulator(Box::new(self.elab(&**mor_type)?)))
            }
        }
    }
}

impl CanElaborate<MorType, TabMorType<Ustr, Ustr>> for Elaborator {
    fn elab(&self, x: &MorType) -> Result<TabMorType<Ustr, Ustr>, String> {
        match x {
            MorType::Basic(ustr) => Ok(TabMorType::Basic(*ustr)),
            MorType::Hom(ob_type) => Ok(TabMorType::Hom(Box::new(self.elab(&**ob_type)?))),
        }
    }
}

impl CanElaborate<MorType, Path<Ustr, Ustr>> for Elaborator {
    fn elab(&self, x: &MorType) -> Result<Path<Ustr, Ustr>, String> {
        match x {
            MorType::Basic(ustr) => Ok(Path::single(*ustr)),
            MorType::Hom(ob_type) => Ok(Path::Id(self.elab(&**ob_type)?)),
        }
    }
}

impl CanElaborate<Ob, Uuid> for Elaborator {
    fn elab(&self, x: &Ob) -> Result<Uuid, String> {
        match x {
            Ob::Basic(uuid) => Ok(*uuid),
            _ => Err(format!("Cannot cast object type for discrete double theory: {x:#?}")),
        }
    }
}

impl CanElaborate<Ob, TabOb<Uuid, Uuid>> for Elaborator {
    fn elab(&self, x: &Ob) -> Result<TabOb<Uuid, Uuid>, String> {
        match x {
            Ob::Basic(uuid) => Ok(TabOb::Basic(*uuid)),
            Ob::Tabulated(mor) => Ok(TabOb::Tabulated(Box::new(self.elab(mor)?))),
        }
    }
}

impl CanElaborate<Mor, Path<Uuid, Uuid>> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<Path<Uuid, Uuid>, String> {
        match mor {
            Mor::Basic(uuid) => Ok(Path::single(*uuid)),
            Mor::Composite(path) => {
                let result_path = upgrade_path(*path.clone())
                    .try_map(|ob| Elaborator.elab(&ob), |mor| Elaborator.elab(&mor));
                result_path.map(|path| path.flatten())
            }
            _ => Err(format!("Cannot cast morphism for discrete double theory: {mor:#?}")),
        }
    }
}

fn upgrade_path<V, E>(p: notebook_path::Path<V, E>) -> Path<V, E> {
    match p {
        notebook_path::Path::Id(v) => Path::Id(v),
        notebook_path::Path::Seq(non_empty) => Path::Seq(non_empty),
    }
}

fn demote_path<V, E>(p: Path<V, E>) -> notebook_path::Path<V, E> {
    match p {
        Path::Id(v) => notebook_path::Path::Id(v),
        Path::Seq(non_empty) => notebook_path::Path::Seq(non_empty),
    }
}

impl CanElaborate<Mor, TabMor<Uuid, Uuid>> for Elaborator {
    fn elab(&self, mor: &Mor) -> Result<TabMor<Uuid, Uuid>, String> {
        match mor {
            Mor::Basic(id) => Ok(Path::single(dbl_model::TabEdge::Basic(*id))),
            Mor::Composite(path) => {
                let result_path = upgrade_path(*path.clone())
                    .try_map(|ob| Elaborator.elab(&ob), |mor| Elaborator.elab(&mor));
                result_path.map(|path| path.flatten())
            }
            Mor::TabulatorSquare {
                dom,
                cod,
                pre,
                post,
            } => Ok(Path::single(dbl_model::TabEdge::Square {
                dom: Box::new(Elaborator.elab(&**dom)?),
                cod: Box::new(Elaborator.elab(&**cod)?),
                pre: Box::new(Elaborator.elab(&**pre)?),
                post: Box::new(Elaborator.elab(&**post)?),
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
                dom: Box::new(Elaborator.elab(&**dom)?),
                cod: Box::new(Elaborator.elab(&**cod)?),
                pre: Box::new(Elaborator.elab(&**pre)?),
                post: Box::new(Elaborator.elab(&**post)?),
            }),
            _ => Err(format!("Cannot cast morphism for discrete tabulator theory: {mor:#?}")),
        }
    }
}

pub struct Quoter;

pub trait CanQuote<T, S> {
    fn quote(&self, x: &T) -> S;
}

impl CanQuote<Uuid, Ob> for Quoter {
    fn quote(&self, id: &Uuid) -> Ob {
        Ob::Basic(*id)
    }
}

impl CanQuote<Ustr, ObType> for Quoter {
    fn quote(&self, id: &Ustr) -> ObType {
        ObType::Basic(*id)
    }
}

impl CanQuote<TabOb<Uuid, Uuid>, Ob> for Quoter {
    fn quote(&self, x: &TabOb<Uuid, Uuid>) -> Ob {
        match x {
            TabOb::Basic(id) => Ob::Basic(*id),
            TabOb::Tabulated(path) => Ob::Tabulated(self.quote(&**path)),
        }
    }
}

impl CanQuote<TabEdge<Uuid, Uuid>, Mor> for Quoter {
    fn quote(&self, x: &TabEdge<Uuid, Uuid>) -> Mor {
        match x {
            TabEdge::Basic(id) => Mor::Basic(*id),
            TabEdge::Square {
                dom,
                cod,
                pre,
                post,
            } => Mor::TabulatorSquare {
                dom: Box::new(self.quote(&**dom)),
                cod: Box::new(self.quote(&**cod)),
                pre: Box::new(self.quote(&**pre)),
                post: Box::new(self.quote(&**post)),
            },
        }
    }
}

impl CanQuote<Path<TabOb<Uuid, Uuid>, TabEdge<Uuid, Uuid>>, Mor> for Quoter {
    fn quote(&self, path: &Path<TabOb<Uuid, Uuid>, TabEdge<Uuid, Uuid>>) -> Mor {
        if path.len() == 1 {
            self.quote(&path.clone().only().unwrap())
        } else {
            Mor::Composite(Box::new(demote_path(
                path.clone().map(|ob| self.quote(&ob), |mor| self.quote(&mor)),
            )))
        }
    }
}

impl CanQuote<Path<Uuid, Uuid>, Mor> for Quoter {
    fn quote(&self, path: &Path<Uuid, Uuid>) -> Mor {
        if path.len() == 1 {
            Mor::Basic(path.clone().only().unwrap())
        } else {
            Mor::Composite(Box::new(demote_path(path.clone().map(Ob::Basic, Mor::Basic))))
        }
    }
}

impl CanQuote<Path<Ustr, Ustr>, MorType> for Quoter {
    fn quote(&self, path: &Path<Ustr, Ustr>) -> MorType {
        match path {
            Path::Id(u) => MorType::Hom(Box::new(ObType::Basic(*u))),
            Path::Seq(non_empty) => MorType::Basic(non_empty[0]),
        }
    }
}

impl DblModel {
    pub fn new(theory: &DblTheory) -> Self {
        Self(match &theory.0 {
            DblTheoryBox::Discrete(th) => DiscreteDblModel::new(th.clone()).into(),
            DblTheoryBox::DiscreteTab(th) => DiscreteTabModel::new(th.clone()).into(),
        })
    }

    pub fn add_ob(&mut self, decl: &ObDecl) -> Result<(), String> {
        all_the_same!(match &mut self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let ob_type = Elaborator.elab(&decl.ob_type)?;
                model.add_ob(decl.id, ob_type);
                Ok(())
            }
        })
    }

    pub fn add_mor(&mut self, decl: &MorDecl) -> Result<(), String> {
        all_the_same!(match &mut self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
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
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let ob = Elaborator.elab(&ob)?;
                Ok(model.has_ob(&ob))
            }
        })
    }

    /// Is the morphism contained in the model?
    #[wasm_bindgen(js_name = "hasMor")]
    pub fn has_mor(&self, mor: Mor) -> Result<bool, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let mor = Elaborator.elab(&mor)?;
                Ok(model.has_mor(&mor))
            }
        })
    }

    /// Returns array of all basic objects in the model.
    #[wasm_bindgen]
    pub fn objects(&self) -> Vec<Ob> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => model.objects().map(|x| Quoter.quote(&x)).collect()
        })
    }

    /// Returns array of all basic morphisms in the model.
    #[wasm_bindgen]
    pub fn morphisms(&self) -> Vec<Mor> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => model.morphisms().map(|f| Quoter.quote(&f)).collect()
        })
    }

    /// Returns array of basic objects with the given type.
    #[wasm_bindgen(js_name = "objectsWithType")]
    pub fn objects_with_type(&self, ob_type: ObType) -> Result<Vec<Ob>, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let ob_type = Elaborator.elab(&ob_type)?;
                Ok(model.objects_with_type(&ob_type).map(|ob| Quoter.quote(&ob)).collect())
            }
        })
    }

    /// Returns array of basic morphisms with the given type.
    #[wasm_bindgen(js_name = "morphismsWithType")]
    pub fn morphisms_with_type(&self, mor_type: MorType) -> Result<Vec<Mor>, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let mor_type = Elaborator.elab(&mor_type)?;
                Ok(model.morphisms_with_type(&mor_type).map(|mor| Quoter.quote(&mor)).collect())
            }
        })
    }

    pub fn validate(&self) -> ModelValidationResult {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
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

#[wasm_bindgen]
pub struct TheoryLibrary(#[wasm_bindgen(skip)] pub HashMap<String, DblTheory>);

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
        let JsResult::Err(errs) = model.validate().0 else {
            panic!("Model should not validate")
        };
        assert_eq!(errs.len(), 2);
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
