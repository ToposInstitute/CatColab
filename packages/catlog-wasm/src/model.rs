//! Wasm bindings for models of double theories.

use std::hash::BuildHasherDefault;

use all_the_same::all_the_same;
use derive_more::{From, TryInto};
use ustr::{IdentityHasher, Ustr, ustr};
use uuid::Uuid;

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use catlog::dbl::functor::{DblFunctor, DiscreteDblTheoryMorphism, FgDiscreteDblTheoryMapping};
use catlog::dbl::model::{
    self as dbl_model, DblModel as CoreDblModel, FgDblModel, InvalidDblModel, MutDblModel,
};
use catlog::dbl::theory::DiscreteDblTheory;
use catlog::one::fin_category::{FinCategory, UstrFinCategory};
use catlog::one::{Category as _, FgCategory, Path};
use catlog::validate::Validate;
use catlog::zero::MutMapping;

use super::result::JsResult;
use super::theory::{DblTheory, DblTheoryBox, MorType, ObType};

/// An object in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Ob {
    /// Basic or generating object.
    Basic(Uuid),

    /// Morphism viewed as an object of a tabulator.
    Tabulated(Mor),
}

/// A morphism in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Mor {
    /// Basic or generating morphism.
    Basic(Uuid),

    /// Composite of morphisms.
    Composite(Box<Path<Ob, Mor>>),

    /// Morphism between tabulated morphisms, a commutative square.
    TabulatorSquare {
        dom: Box<Mor>,
        cod: Box<Mor>,
        pre: Box<Mor>,
        post: Box<Mor>,
    },
}

/// Convert from an object in a model of discrete double theory.
impl From<Uuid> for Ob {
    fn from(value: Uuid) -> Self {
        Ob::Basic(value)
    }
}

/// Convert from a morphism in a model of a discrete double theory.
impl From<Path<Uuid, Uuid>> for Mor {
    fn from(path: Path<Uuid, Uuid>) -> Self {
        if path.len() == 1 {
            Mor::Basic(path.only().unwrap())
        } else {
            Mor::Composite(Box::new(path.map(Ob::Basic, Mor::Basic)))
        }
    }
}

/// Convert into an object in a model of a discrete double theory.
impl TryFrom<Ob> for Uuid {
    type Error = String;

    fn try_from(ob: Ob) -> Result<Self, Self::Error> {
        match ob {
            Ob::Basic(id) => Ok(id),
            _ => Err(format!("Cannot cast object for discrete double theory: {:#?}", ob)),
        }
    }
}

/// Convert into a morphism in a model of a discrete double theory.
impl TryFrom<Mor> for Path<Uuid, Uuid> {
    type Error = String;

    fn try_from(mor: Mor) -> Result<Self, Self::Error> {
        match mor {
            Mor::Basic(id) => Ok(Path::single(id)),
            Mor::Composite(path) => {
                let result_path = (*path).try_map(|ob| ob.try_into(), |mor| mor.try_into());
                result_path.map(|path| path.flatten())
            }
            _ => Err(format!("Cannot cast morphism for discrete double theory: {:#?}", mor)),
        }
    }
}

/// Convert into an object in a model of a discrete tabulator theory.
impl TryFrom<Ob> for dbl_model::TabOb<Uuid, Uuid> {
    type Error = String;

    fn try_from(ob: Ob) -> Result<Self, Self::Error> {
        match ob {
            Ob::Basic(id) => Ok(dbl_model::TabOb::Basic(id)),
            Ob::Tabulated(f) => Ok(dbl_model::TabOb::Tabulated(Box::new(f.try_into()?))),
        }
    }
}

/// Convert into a morphism in a model of a discrete tabulator theory.
impl TryFrom<Mor> for dbl_model::TabMor<Uuid, Uuid> {
    type Error = String;

    fn try_from(mor: Mor) -> Result<Self, Self::Error> {
        match mor {
            Mor::Basic(id) => Ok(Path::single(dbl_model::TabEdge::Basic(id))),
            Mor::Composite(path) => {
                let result_path = (*path).try_map(|ob| ob.try_into(), |mor| mor.try_into());
                result_path.map(|path| path.flatten())
            }
            Mor::TabulatorSquare {
                dom,
                cod,
                pre,
                post,
            } => Ok(Path::single(dbl_model::TabEdge::Square {
                dom: Box::new((*dom).try_into()?),
                cod: Box::new((*cod).try_into()?),
                pre: Box::new((*pre).try_into()?),
                post: Box::new((*post).try_into()?),
            })),
        }
    }
}

impl TryFrom<Mor> for dbl_model::TabEdge<Uuid, Uuid> {
    type Error = String;

    fn try_from(mor: Mor) -> Result<Self, Self::Error> {
        match mor {
            Mor::Basic(id) => Ok(dbl_model::TabEdge::Basic(id)),
            Mor::TabulatorSquare {
                dom,
                cod,
                pre,
                post,
            } => Ok(dbl_model::TabEdge::Square {
                dom: Box::new((*dom).try_into()?),
                cod: Box::new((*cod).try_into()?),
                pre: Box::new((*pre).try_into()?),
                post: Box::new((*post).try_into()?),
            }),
            _ => Err(format!("Cannot cast morphism for discrete tabulator theory: {:#?}", mor)),
        }
    }
}

/// Convert from an object in a model of a discrete tabulator theory.
impl From<dbl_model::TabOb<Uuid, Uuid>> for Ob {
    fn from(value: dbl_model::TabOb<Uuid, Uuid>) -> Self {
        match value {
            dbl_model::TabOb::Basic(x) => Ob::Basic(x),
            dbl_model::TabOb::Tabulated(f) => Ob::Tabulated((*f).into()),
        }
    }
}

/// Convert from a morphism in a model of a discrete tabulator theory.
impl From<dbl_model::TabMor<Uuid, Uuid>> for Mor {
    fn from(path: dbl_model::TabMor<Uuid, Uuid>) -> Self {
        if path.len() == 1 {
            path.only().unwrap().into()
        } else {
            Mor::Composite(Box::new(path.map(|ob| ob.into(), |mor| mor.into())))
        }
    }
}

impl From<dbl_model::TabEdge<Uuid, Uuid>> for Mor {
    fn from(value: dbl_model::TabEdge<Uuid, Uuid>) -> Self {
        match value {
            dbl_model::TabEdge::Basic(f) => Mor::Basic(f),
            dbl_model::TabEdge::Square {
                dom,
                cod,
                pre,
                post,
            } => Mor::TabulatorSquare {
                dom: Box::new((*dom).into()),
                cod: Box::new((*cod).into()),
                pre: Box::new((*pre).into()),
                post: Box::new((*post).into()),
            },
        }
    }
}

/// Declares an object in a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct ObDecl {
    /// Globally unique identifier of object.
    pub id: Uuid,

    /// The object's type in the double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,
}

/// Declares a morphism in a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MorDecl {
    /// Globally unique identifier of morphism.
    pub id: Uuid,

    /// The morphism's type in the double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Domain of morphism, if defined.
    pub dom: Option<Ob>,

    /// Codomain of morphism, if defined.
    pub cod: Option<Ob>,
}

pub(crate) type DiscreteDblModel = dbl_model::DiscreteDblModel<Uuid, UstrFinCategory>;
pub(crate) type DiscreteTabModel =
    dbl_model::DiscreteTabModel<Uuid, Ustr, BuildHasherDefault<IdentityHasher>>;

#[wasm_bindgen]
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
pub struct MapData {
    domob: Vec<ObType>,
    codob: Vec<ObType>,
    domhom: Vec<MorType>,
    codhom: Vec<MorType>,
}

#[wasm_bindgen]
impl MapData {
    #[wasm_bindgen(constructor)]
    pub fn new(
        domob: Vec<String>,
        codob: Vec<String>,
        domhom: Vec<String>,
        codhom: Vec<String>,
    ) -> MapData {
        MapData {
            domob: domob.iter().map(|v| ObType::Basic(ustr(v))).collect(),
            codob: codob.iter().map(|v| ObType::Basic(ustr(v))).collect(),
            domhom: domhom.iter().map(|v| MorType::Basic(ustr(v))).collect(),
            codhom: codhom.iter().map(|v| MorType::Basic(ustr(v))).collect(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn domob(&self) -> Vec<ObType> {
        self.domob.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn codob(&self) -> Vec<ObType> {
        self.codob.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn domhom(&self) -> Vec<MorType> {
        self.domhom.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn codhom(&self) -> Vec<MorType> {
        self.codhom.clone()
    }

    #[wasm_bindgen]
    pub fn includes_ob(&self, ob: &ObType) -> bool {
        self.codob.contains(ob)
    }

    #[wasm_bindgen]
    pub fn includes_mor(&self, mor: &MorType) -> bool {
        match mor {
            MorType::Basic(_) => self.codhom.contains(mor),
            MorType::Hom(x) => self.codob.contains(x),
        }
    }

    #[wasm_bindgen]
    pub fn swap(&self) -> MapData {
        MapData {
            domob: self.codob(),
            codob: self.domob(),
            domhom: self.codhom(),
            codhom: self.domhom(),
        }
    }
}

/** A box containing a model of a double theory of any kind.

See [`DblTheoryBox`] for motivation.
 */
#[derive(From, TryInto)]
#[try_into(ref)]
pub enum DblModelBox {
    Discrete(DiscreteDblModel),
    DiscreteTab(DiscreteTabModel),
}

/// Wasm bindings for a model of a double theory.
#[wasm_bindgen]
pub struct DblModel(#[wasm_bindgen(skip)] pub DblModelBox);

#[wasm_bindgen]
impl DblModel {
    /// Creates an empty model of the given theory.
    #[wasm_bindgen(constructor)]
    pub fn new(theory: &DblTheory) -> Self {
        Self(match &theory.0 {
            DblTheoryBox::Discrete(th) => DiscreteDblModel::new(th.clone()).into(),
            DblTheoryBox::DiscreteTab(th) => DiscreteTabModel::new(th.clone()).into(),
        })
    }

    // Get the model's theory (todo figure out how to make it work when theories
    // have different types, needed for supporting DiscreteTab)
    fn theory_arc(
        &self,
    ) -> Arc<DiscreteDblTheory<FinCategory<Ustr, Ustr, BuildHasherDefault<IdentityHasher>>>> {
        match &self.0 {
            DblModelBox::Discrete(dblmod) => dblmod.theory_arc(),
            DblModelBox::DiscreteTab(_) => panic!("Tab theories not yet supported"), // dblmod.theory_arc() // HAS A DIFFERENT RETURN TYPE
        }
    }

    /// Pushforward a model along a theory inclusion implicitly specified by
    /// ob/hom maps, where maps are given as pairs of vectors.
    #[wasm_bindgen]
    pub fn pushforward(&self, codtheory: &DblTheory, md: &MapData) -> Result<DblModel, String> {
        // Parse the string data into a `DiscreteDblTheoryMorphism`
        let mut v: FgDiscreteDblTheoryMapping<_, _, _, _> = Default::default();
        for (a, b) in md.domob.clone().into_iter().zip(md.codob.clone()) {
            match (a, b) {
                (ObType::Basic(x), ObType::Basic(y)) => {
                    v.ob_map.set(ustr(&x), ustr(&y));
                }
                _ => panic!("Tabulators not covered"),
            }
        }
        for (a, b) in md.domhom.clone().into_iter().zip(md.codhom.clone()) {
            match (a, b) {
                (MorType::Basic(x), MorType::Basic(y)) => {
                    v.mor_map.set(ustr(&x), ustr(&y));
                }
                _ => panic!("Tabulators not covered"),
            }
        }

        let cod = match &codtheory.0 {
            DblTheoryBox::Discrete(th) => th,
            _ => panic!("Tab not supported"),
        };

        let dom = self.theory_arc();
        let fun: DiscreteDblTheoryMorphism<_, _> = DblFunctor(&v, &dom, cod);

        match &self.0 {
            DblModelBox::Discrete(model) => {
                Ok(DblModel(DblModelBox::Discrete(fun.pushforward(cod.clone(), model))))
            }
            _ => panic!("Tab not supported"),
        }
    }

    /// Adds an object to the model.
    #[wasm_bindgen(js_name = "addOb")]
    pub fn add_ob(&mut self, decl: ObDecl) -> Result<bool, String> {
        all_the_same!(match &mut self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let ob_type = decl.ob_type.try_into()?;
                Ok(model.add_ob(decl.id, ob_type))
            }
        })
    }

    /// Adds a morphism to the model.
    #[wasm_bindgen(js_name = "addMor")]
    pub fn add_mor(&mut self, decl: MorDecl) -> Result<bool, String> {
        all_the_same!(match &mut self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let mor_type = decl.mor_type.try_into()?;
                let res = model.make_mor(decl.id, mor_type);
                if let Some(dom) = decl.dom.map(|ob| ob.try_into()).transpose()? {
                    model.set_dom(decl.id, dom);
                }
                if let Some(cod) = decl.cod.map(|ob| ob.try_into()).transpose()? {
                    model.set_cod(decl.id, cod);
                }
                Ok(res)
            }
        })
    }

    /// Is the object contained in the model?
    #[wasm_bindgen(js_name = "hasOb")]
    pub fn has_ob(&self, ob: Ob) -> Result<bool, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let ob = ob.try_into()?;
                Ok(model.has_ob(&ob))
            }
        })
    }

    /// Is the morphism contained in the model?
    #[wasm_bindgen(js_name = "hasMor")]
    pub fn has_mor(&self, mor: Mor) -> Result<bool, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let mor = mor.try_into()?;
                Ok(model.has_mor(&mor))
            }
        })
    }

    /// What is the type of this object? Expects `has_ob(ob) == true`
    #[wasm_bindgen(js_name = "obType")]
    pub fn ob_type(&self, ob: Ob) -> Result<ObType, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let ob = ob.try_into()?;
                Ok(model.ob_type(&ob).into())
            }
        })
    }

    /// What is the type of this object? Expects `has_ob(ob) == true`
    #[wasm_bindgen(js_name = "morType")]
    pub fn mor_type(&self, mor: Mor) -> Result<MorType, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let mor = mor.try_into()?;
                Ok(model.mor_type(&mor).into())
            }
        })
    }

    /// Returns array of all basic objects in the model.
    #[wasm_bindgen]
    pub fn objects(&self) -> Vec<Ob> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => model.objects().map(|x| x.into()).collect()
        })
    }

    /// Returns array of all basic morphisms in the model.
    #[wasm_bindgen]
    pub fn morphisms(&self) -> Vec<Mor> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => model.morphisms().map(|f| f.into()).collect()
        })
    }

    /// Returns array of basic objects with the given type.
    #[wasm_bindgen(js_name = "objectsWithType")]
    pub fn objects_with_type(&self, ob_type: ObType) -> Result<Vec<Ob>, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let ob_type = ob_type.try_into()?;
                Ok(model.objects_with_type(&ob_type).map(|ob| ob.into()).collect())
            }
        })
    }

    /// Returns array of basic morphisms with the given type.
    #[wasm_bindgen(js_name = "morphismsWithType")]
    pub fn morphisms_with_type(&self, mor_type: MorType) -> Result<Vec<Mor>, String> {
        all_the_same!(match &self.0 {
            DblModelBox::[Discrete, DiscreteTab](model) => {
                let mor_type = mor_type.try_into()?;
                Ok(model.morphisms_with_type(&mor_type).map(|mor| mor.into()).collect())
            }
        })
    }

    /// Validates that the model is well defined.
    #[wasm_bindgen]
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

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::theories::*;

    pub(crate) fn sch_walking_attr(th: &DblTheory, ids: [Uuid; 3]) -> DblModel {
        let mut model = DblModel::new(th);
        let [attr, entity, attr_type] = ids;
        assert!(
            model
                .add_ob(ObDecl {
                    id: entity,
                    ob_type: ObType::Basic("Entity".into()),
                })
                .is_ok()
        );
        assert!(
            model
                .add_ob(ObDecl {
                    id: attr_type,
                    ob_type: ObType::Basic("AttrType".into()),
                })
                .is_ok()
        );
        assert!(
            model
                .add_mor(MorDecl {
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
                .add_mor(MorDecl {
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
                .add_ob(ObDecl {
                    id: x,
                    ob_type: ObType::Basic("Object".into()),
                })
                .is_ok()
        );
        assert!(
            model
                .add_ob(ObDecl {
                    id: y,
                    ob_type: ObType::Basic("Object".into()),
                })
                .is_ok()
        );
        assert!(
            model
                .add_mor(MorDecl {
                    id: f,
                    mor_type: MorType::Hom(Box::new(ObType::Basic("Object".into()))),
                    dom: Some(Ob::Basic(x)),
                    cod: Some(Ob::Basic(y)),
                })
                .is_ok()
        );
        assert!(
            model
                .add_mor(MorDecl {
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
