use super::result::JsResult;
use super::theory::{DblTheory, DblTheoryBox};

use catlog::dbl::model::FgDblModel;
use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use all_the_same::all_the_same;
use catlog::validate::Validate;
use catlog::{
    dbl::{
        model::{self as dbl_model, InvalidDblModel, MutDblModel, TabEdge, TabMor, TabOb},
        theory::{TabMorType, TabObType},
    },
    one::{Category as _, FgCategory, Path, fin_category::FinMor},
};
use derive_more::{From, TryInto};
use notebook_types::current::{
    cell::Cell,
    document::ModelDocument,
    model::{Mor, Ob},
    model_judgment::ModelDecl,
    path as notebook_path,
    theory::{MorType, ObType},
};

use ustr::{IdentityHasher, Ustr};
use uuid::Uuid;

use catlog::one::fin_category::UstrFinCategory;
use std::collections::HashMap;
use std::hash::BuildHasherDefault;
// use catlog::one::{Category as _, FgCategory, Path};
// use catlog::validate::Validate;

pub(crate) type DiscreteDblModel = dbl_model::DiscreteDblModel<Uuid, UstrFinCategory>;
pub(crate) type DiscreteTabModel =
    dbl_model::DiscreteTabModel<Uuid, Ustr, BuildHasherDefault<IdentityHasher>>;

/** A box containing a model of a double theory of any kind.

See [`DblTheoryBox`] for motivation.
 */
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
            _ => Err(format!("Cannot cast object type for discrete double theory: {:#?}", x)),
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

impl CanElaborate<MorType, FinMor<Ustr, Ustr>> for Elaborator {
    fn elab(&self, x: &MorType) -> Result<FinMor<Ustr, Ustr>, String> {
        match x {
            MorType::Basic(ustr) => Ok(FinMor::Generator(*ustr)),
            MorType::Hom(ob_type) => Ok(FinMor::Id(self.elab(&**ob_type)?)),
        }
    }
}

impl CanElaborate<Ob, Uuid> for Elaborator {
    fn elab(&self, x: &Ob) -> Result<Uuid, String> {
        match x {
            Ob::Basic(uuid) => Ok(*uuid),
            _ => Err(format!("Cannot cast object type for discrete double theory: {:#?}", x)),
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
            _ => Err(format!("Cannot cast morphism for discrete double theory: {:#?}", mor)),
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
            _ => Err(format!("Cannot cast morphism for discrete tabulator theory: {:#?}", mor)),
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

impl CanQuote<FinMor<Uuid, Uuid>, Mor> for Quoter {
    fn quote(&self, x: &FinMor<Uuid, Uuid>) -> Mor {
        match x {
            FinMor::Id(id) => Mor::Composite(Box::new(notebook_path::Path::Id(Ob::Basic(*id)))),
            FinMor::Generator(id) => Mor::Basic(*id),
        }
    }
}

impl CanQuote<FinMor<Ustr, Ustr>, MorType> for Quoter {
    fn quote(&self, x: &FinMor<Ustr, Ustr>) -> MorType {
        match x {
            FinMor::Id(id) => MorType::Hom(Box::new(ObType::Basic(*id))),
            FinMor::Generator(id) => MorType::Basic(*id),
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

    pub fn add_ob(&mut self, id: Uuid, ob_type: &ObType) -> Result<bool, String> {
        all_the_same!(match &mut self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let ob_type = Elaborator.elab(ob_type)?;
                Ok(model.add_ob(id, ob_type))
            }
        })
    }

    pub fn add_mor(
        &mut self,
        id: Uuid,
        mor_type: &MorType,
        dom: &Option<Ob>,
        cod: &Option<Ob>,
    ) -> Result<bool, String> {
        all_the_same!(match &mut self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let mor_type = Elaborator.elab(mor_type)?;
                let res = model.make_mor(id, mor_type);
                if let Some(dom) = dom.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    model.set_dom(id, dom);
                }
                if let Some(cod) = cod.as_ref().map(|ob| Elaborator.elab(ob)).transpose()? {
                    model.set_cod(id, cod);
                }
                Ok(res)
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
pub fn elaborate_model(doc: &ModelDocument, theory: &DblTheory) -> DblModel {
    let mut model = DblModel::new(theory);
    for cell in doc.notebook.cells.iter() {
        if let Cell::Formal { id: _, content } = cell {
            match content {
                ModelDecl::ObjectDecl {
                    name: _,
                    id,
                    ob_type,
                } => {
                    model.add_ob(*id, ob_type).unwrap();
                }
                ModelDecl::MorphismDecl {
                    name: _,
                    id,
                    mor_type,
                    dom,
                    cod,
                } => {
                    model.add_mor(*id, mor_type, dom, cod).unwrap();
                }
            }
        }
    }
    model
}
