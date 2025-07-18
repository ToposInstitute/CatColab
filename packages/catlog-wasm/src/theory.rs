//! Wasm bindings for double theories.

use std::collections::HashMap;
use std::rc::Rc;

use all_the_same::all_the_same;
use derive_more::From;
use ustr::Ustr;

use wasm_bindgen::prelude::*;

use catlog::dbl::theory::{
    self, DblTheory as _, ModalMorType, ModalObOp, ModalObType, ModalOp, ModeApp, TabMorType,
    TabObOp, TabObType,
};
use catlog::one::{Path, ShortPath};
use notebook_types::current::theory::*;

use super::notation::*;

/// Elaborates into object type in a discrete double theory.
impl CanElaborate<ObType, Ustr> for Elaborator {
    fn elab(&self, ob_type: &ObType) -> Result<Ustr, String> {
        match ob_type {
            ObType::Basic(id) => Ok(*id),
            _ => Err(format!("Cannot use object type in discrete double theory: {ob_type:#?}")),
        }
    }
}

/// Elaborates into morphism type in a discrete double theory.
impl CanElaborate<MorType, Path<Ustr, Ustr>> for Elaborator {
    fn elab(&self, mor_type: &MorType) -> Result<Path<Ustr, Ustr>, String> {
        match mor_type {
            MorType::Basic(id) => Ok(Path::single(*id)),
            MorType::Composite(fs) => {
                let fs: Result<Vec<_>, _> = fs.iter().map(|f| self.elab(f)).collect();
                let path = Path::from_vec(fs?).ok_or("Composite should not be empty")?;
                Ok(path.flatten())
            }
            MorType::Hom(ob_type) => Ok(Path::Id(self.elab(ob_type.as_ref())?)),
            _ => Err(format!("Cannot use morphsim type in discrete double theory: {mor_type:#?}")),
        }
    }
}

/// Elaborates into object operation in a discrete double theory.
impl CanElaborate<ObOp, Ustr> for Elaborator {
    fn elab(&self, op: &ObOp) -> Result<Ustr, String> {
        match op {
            ObOp::Id(ObType::Basic(id)) => Ok(*id),
            _ => Err(format!("Cannot use operation in discrete double theory: {op:#?}")),
        }
    }
}

/// Elaborates into object type in a discrete tabulator theory.
impl CanElaborate<ObType, TabObType<Ustr, Ustr>> for Elaborator {
    fn elab(&self, ob_type: &ObType) -> Result<TabObType<Ustr, Ustr>, String> {
        match ob_type {
            ObType::Basic(id) => Ok(TabObType::Basic(*id)),
            ObType::Tabulator(mor_type) => {
                Ok(TabObType::Tabulator(Box::new(self.elab(mor_type.as_ref())?)))
            }
            _ => Err(format!("Cannot use object type in discrete tabulator theory: {ob_type:#?}")),
        }
    }
}

/// Elaborates into morphism type in a discrete tabulator theory.
impl CanElaborate<MorType, TabMorType<Ustr, Ustr>> for Elaborator {
    fn elab(&self, mor_type: &MorType) -> Result<TabMorType<Ustr, Ustr>, String> {
        match mor_type {
            MorType::Basic(id) => Ok(TabMorType::Basic(*id)),
            MorType::Composite(_) => {
                Err("Composites not yet implemented for tabulator theories".into())
            }
            MorType::Hom(ob_type) => Ok(TabMorType::Hom(Box::new(self.elab(ob_type.as_ref())?))),
            _ => {
                Err(format!("Cannot use morphism type in discrete tabulator theory: {mor_type:#?}"))
            }
        }
    }
}

/// Elaborates into object operation in a discrete tabulator theory.
impl CanElaborate<ObOp, TabObOp<Ustr, Ustr>> for Elaborator {
    fn elab(&self, op: &ObOp) -> Result<TabObOp<Ustr, Ustr>, String> {
        match op {
            ObOp::Id(ob_type) => Ok(Path::empty(self.elab(ob_type)?)),
            _ => Err(format!("Cannot use operation in discrete tabulator theory: {op:#?}")),
        }
    }
}

/// Elaborates into object type in a modal double theory.
impl CanElaborate<ObType, ModalObType<Ustr>> for Elaborator {
    fn elab(&self, ob_type: &ObType) -> Result<ModalObType<Ustr>, String> {
        match ob_type {
            ObType::Basic(id) => Ok(ModeApp::new(*id)),
            ObType::ModeApp { modality, ob_type } => Ok({
                let ob_type: ModalObType<_> = self.elab(ob_type.as_ref())?;
                ob_type.apply(promote_modality(*modality))
            }),
            _ => Err(format!("Cannot use object type in modal theory: {ob_type:#?}")),
        }
    }
}

/// Elaborates into morphism type in a modal double theory.
impl CanElaborate<MorType, ModalMorType<Ustr>> for Elaborator {
    fn elab(&self, mor_type: &MorType) -> Result<ModalMorType<Ustr>, String> {
        match mor_type {
            MorType::Basic(id) => Ok(ModeApp::new(*id).into()),
            MorType::Hom(ob_type) => Ok(ShortPath::Zero(self.elab(ob_type.as_ref())?)),
            MorType::ModeApp { modality, mor_type } => Ok({
                let mor_type: ModalMorType<_> = self.elab(mor_type.as_ref())?;
                mor_type.apply(promote_modality(*modality))
            }),
            _ => Err(format!("Cannot use morphism type in modal theory: {mor_type:#?}")),
        }
    }
}

/// Elaborates into an object operation in a modal double theory.
impl CanElaborate<ObOp, ModalObOp<Ustr>> for Elaborator {
    fn elab(&self, op: &ObOp) -> Result<ModalObOp<Ustr>, String> {
        match op {
            ObOp::Basic(id) => Ok(ModeApp::new(ModalOp::Generator(*id)).into()),
            ObOp::Id(ob_type) => Ok(Path::empty(self.elab(ob_type)?)),
            ObOp::Composite(ops) => {
                let ops: Result<Vec<_>, _> = ops.iter().map(|op| self.elab(op)).collect();
                Ok(Path::from_vec(ops?).ok_or("Composite should be non-empty")?.flatten())
            }
            ObOp::ModeApp { modality, op } => Ok({
                let op: ModalObOp<_> = self.elab(op.as_ref())?;
                op.apply(promote_modality(*modality))
            }),
        }
    }
}

pub(crate) fn promote_modality(modality: Modality) -> theory::Modality {
    match modality {
        Modality::Discrete => theory::Modality::Discrete(),
        Modality::Codiscrete => theory::Modality::Codiscrete(),
        Modality::List => theory::Modality::List(theory::List::Plain),
        Modality::SymmetricList => theory::Modality::List(theory::List::Symmetric),
        Modality::ProductList => theory::Modality::List(theory::List::Product),
        Modality::CoproductList => theory::Modality::List(theory::List::Coproduct),
        Modality::BiproductList => theory::Modality::List(theory::List::Biproduct),
    }
}

/// Quotes an object type in a discrete double theory.
impl CanQuote<Ustr, ObType> for Quoter {
    fn quote(&self, id: &Ustr) -> ObType {
        ObType::Basic(*id)
    }
}

/// Quotes a morphism type in a discrete double theory.
impl CanQuote<Path<Ustr, Ustr>, MorType> for Quoter {
    fn quote(&self, path: &Path<Ustr, Ustr>) -> MorType {
        match path {
            Path::Id(v) => MorType::Hom(Box::new(ObType::Basic(*v))),
            Path::Seq(edges) => {
                if edges.len() == 1 {
                    MorType::Basic(edges.head)
                } else {
                    MorType::Composite(edges.iter().map(|e| MorType::Basic(*e)).collect())
                }
            }
        }
    }
}

/// Quotes an object operation in a discrete double theory.
impl CanQuote<Ustr, ObOp> for Quoter {
    fn quote(&self, id: &Ustr) -> ObOp {
        ObOp::Id(ObType::Basic(*id))
    }
}

/// Quotes an object type in a discrete tabulator theory.
impl CanQuote<TabObType<Ustr, Ustr>, ObType> for Quoter {
    fn quote(&self, ob_type: &TabObType<Ustr, Ustr>) -> ObType {
        match ob_type {
            TabObType::Basic(name) => ObType::Basic(*name),
            TabObType::Tabulator(mor_type) => {
                ObType::Tabulator(Box::new(self.quote(mor_type.as_ref())))
            }
        }
    }
}

/// Quotes a morphism type in a discrete tabulator theory.
impl CanQuote<TabMorType<Ustr, Ustr>, MorType> for Quoter {
    fn quote(&self, mor_type: &TabMorType<Ustr, Ustr>) -> MorType {
        match mor_type {
            TabMorType::Basic(name) => MorType::Basic(*name),
            TabMorType::Hom(ob_type) => MorType::Hom(Box::new(self.quote(ob_type.as_ref()))),
        }
    }
}

/// Quotes an object type in a modal theory.
impl CanQuote<ModalObType<Ustr>, ObType> for Quoter {
    fn quote(&self, app: &ModalObType<Ustr>) -> ObType {
        let mut quoted = ObType::Basic(app.arg);
        for modality in &app.modalities {
            quoted = ObType::ModeApp {
                modality: demote_modality(*modality),
                ob_type: quoted.into(),
            }
        }
        quoted
    }
}

/// Quotes a morphism type in a modal theory.
impl CanQuote<ModalMorType<Ustr>, MorType> for Quoter {
    fn quote(&self, mor_type: &ModalMorType<Ustr>) -> MorType {
        match mor_type {
            ShortPath::Zero(ob_type) => MorType::Hom(Box::new(self.quote(ob_type))),
            ShortPath::One(app) => {
                let mut quoted = MorType::Basic(app.arg);
                for modality in &app.modalities {
                    quoted = MorType::ModeApp {
                        modality: demote_modality(*modality),
                        mor_type: quoted.into(),
                    }
                }
                quoted
            }
        }
    }
}

pub(crate) fn demote_modality(modality: theory::Modality) -> Modality {
    match modality {
        theory::Modality::Discrete() => Modality::Discrete,
        theory::Modality::Codiscrete() => Modality::Codiscrete,
        theory::Modality::List(list_type) => match list_type {
            theory::List::Plain => Modality::List,
            theory::List::Symmetric => Modality::SymmetricList,
            theory::List::Product => Modality::ProductList,
            theory::List::Coproduct => Modality::CoproductList,
            theory::List::Biproduct => Modality::BiproductList,
        },
    }
}

/** A box containing a double theory of any kind.

Ideally the Wasm-bound [`DblTheory`] would just have a type parameter for the
underlying double theory, but `wasm-bindgen` does not support
[generics](https://github.com/rustwasm/wasm-bindgen/issues/3309). Instead, we
explicitly enumerate the supported kinds of double theories in this enum.
 */
#[derive(From)]
pub enum DblTheoryBox {
    Discrete(Rc<theory::UstrDiscreteDblTheory>),
    DiscreteTab(Rc<theory::UstrDiscreteTabTheory>),
    Modal(Rc<theory::UstrModalDblTheory>),
}

/** Wasm bindings for a double theory.
 */
#[wasm_bindgen]
pub struct DblTheory(#[wasm_bindgen(skip)] pub DblTheoryBox);

#[wasm_bindgen]
impl DblTheory {
    /// Source of a morphism type.
    #[wasm_bindgen]
    pub fn src(&self, mor_type: MorType) -> Result<ObType, String> {
        all_the_same!(match &self.0 {
            DblTheoryBox::[Discrete, DiscreteTab, Modal](th) => {
                let m = Elaborator.elab(&mor_type)?;
                Ok(Quoter.quote(&th.src_type(&m)))
            }
        })
    }

    /// Target of a morphism type.
    #[wasm_bindgen]
    pub fn tgt(&self, mor_type: MorType) -> Result<ObType, String> {
        all_the_same!(match &self.0 {
            DblTheoryBox::[Discrete, DiscreteTab, Modal](th) => {
                let m = Elaborator.elab(&mor_type)?;
                Ok(Quoter.quote(&th.tgt_type(&m)))
            }
        })
    }

    /// Domain of an object operation.
    #[wasm_bindgen]
    pub fn dom(&self, op: ObOp) -> Result<ObType, String> {
        all_the_same!(match &self.0 {
            DblTheoryBox::[Discrete, DiscreteTab, Modal](th) => {
                let op = Elaborator.elab(&op)?;
                Ok(Quoter.quote(&th.ob_op_dom(&op)))
            }
        })
    }

    /// Codomain of an object operation.
    #[wasm_bindgen]
    pub fn cod(&self, op: ObOp) -> Result<ObType, String> {
        all_the_same!(match &self.0 {
            DblTheoryBox::[Discrete, DiscreteTab, Modal](th) => {
                let op = Elaborator.elab(&op)?;
                Ok(Quoter.quote(&th.ob_op_cod(&op)))
            }
        })
    }
}

/** Mapping from object types to numerical indices.

Like [`MorTypeIndex`], this struct just compensates for the lack of hash maps
with arbitrary keys in JavaScript.
 */
#[wasm_bindgen]
#[derive(Clone, Default)]
pub struct ObTypeIndex(HashMap<ObType, usize>);

#[wasm_bindgen]
impl ObTypeIndex {
    /// Creates a new object type index.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Default::default()
    }

    /// Gets the index of an object type, if set.
    #[wasm_bindgen]
    pub fn get(&self, x: &ObType) -> Option<usize> {
        self.0.get(x).copied()
    }

    /// Sets the index of an object type.
    #[wasm_bindgen]
    pub fn set(&mut self, x: ObType, i: usize) {
        self.0.insert(x, i);
    }
}

/** Mapping from morphism types to numerical indices.

Like [`ObTypeIndex`], this struct just compensates for the lack of hash maps
with arbitrary keys in JavaScript.
 */
#[wasm_bindgen]
#[derive(Clone, Default)]
pub struct MorTypeIndex(HashMap<MorType, usize>);

#[wasm_bindgen]
impl MorTypeIndex {
    /// Creates a new morphism type index.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Default::default()
    }

    /// Gets the index of a morphism type, if set.
    #[wasm_bindgen]
    pub fn get(&self, m: &MorType) -> Option<usize> {
        self.0.get(m).copied()
    }

    /// Sets the index of a morphism type.
    #[wasm_bindgen]
    pub fn set(&mut self, m: MorType, i: usize) {
        self.0.insert(m, i);
    }
}
