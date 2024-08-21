//! Wasm bindings for double theories.

use all_the_same::all_the_same;
use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Arc;
use ustr::Ustr;

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use catlog::dbl::theory;
use catlog::dbl::theory::{DblTheory as BaseDblTheory, TabMorType, TabObType};
use catlog::one::fin_category::*;

/// Object type in a double theory.
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ObType {
    /// Basic or generating object type.
    Basic(Ustr),

    /// Tabulator of a morphism type.
    Tabulator(Box<MorType>),
}

/// Morphism type in a double theory.
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum MorType {
    /// Basic or generating morphism type.
    Basic(Ustr),

    /// Hom type on an object type.
    Hom(Box<ObType>),
}

/// Convert from object type in a discrete double theory.
impl From<Ustr> for ObType {
    fn from(value: Ustr) -> Self {
        ObType::Basic(value)
    }
}

/// Convert from morphism type in a discrete double theory.
impl From<FinHom<Ustr, Ustr>> for MorType {
    fn from(hom: FinHom<Ustr, Ustr>) -> Self {
        match hom {
            FinHom::Generator(e) => MorType::Basic(e),
            FinHom::Id(v) => MorType::Hom(Box::new(ObType::Basic(v))),
        }
    }
}

/// Convert into object type in a discrete double theory.
impl TryFrom<ObType> for Ustr {
    type Error = String;

    fn try_from(ob_type: ObType) -> Result<Self, Self::Error> {
        match ob_type {
            ObType::Basic(name) => Ok(name),
            _ => Err(format!("Cannot cast object type for discrete double theory: {:#?}", ob_type)),
        }
    }
}

/// Convert into morphism type in a discrete double theory.
impl TryFrom<MorType> for FinHom<Ustr, Ustr> {
    type Error = String;

    fn try_from(mor_type: MorType) -> Result<Self, Self::Error> {
        match mor_type {
            MorType::Basic(name) => Ok(FinHom::Generator(name)),
            MorType::Hom(x) => (*x).try_into().map(FinHom::Id),
        }
    }
}

/// Convert from object type in a discrete tabulator theory.
impl From<TabObType<Ustr, Ustr>> for ObType {
    fn from(ob_type: TabObType<Ustr, Ustr>) -> Self {
        match ob_type {
            TabObType::Basic(name) => ObType::Basic(name),
            TabObType::Tabulator(m) => ObType::Tabulator(Box::new((*m).into())),
        }
    }
}

/// Convert from morphism type in a discrete tabulator theory.
impl From<TabMorType<Ustr, Ustr>> for MorType {
    fn from(mor_type: TabMorType<Ustr, Ustr>) -> Self {
        match mor_type {
            TabMorType::Basic(name) => MorType::Basic(name),
            TabMorType::Hom(x) => MorType::Hom(Box::new((*x).into())),
        }
    }
}

/// Convert into object type in a discrete tabulator theory.
impl TryFrom<ObType> for TabObType<Ustr, Ustr> {
    type Error = String;

    fn try_from(ob_type: ObType) -> Result<Self, Self::Error> {
        match ob_type {
            ObType::Basic(name) => Ok(TabObType::Basic(name)),
            ObType::Tabulator(m) => (*m).try_into().map(|m| TabObType::Tabulator(Box::new(m))),
        }
    }
}

/// Convert into morphism type in a discrete tabulator theory.
impl TryFrom<MorType> for TabMorType<Ustr, Ustr> {
    type Error = String;

    fn try_from(mor_type: MorType) -> Result<Self, Self::Error> {
        match mor_type {
            MorType::Basic(name) => Ok(TabMorType::Basic(name)),
            MorType::Hom(x) => (*x).try_into().map(|x| TabMorType::Hom(Box::new(x))),
        }
    }
}

/** Wrapper for double theories of various kinds.

Ideally the Wasm-bound `DblTheory` would just have a type parameter for the
underlying double theory, but `wasm-bindgen` does not support
[generics](https://github.com/rustwasm/wasm-bindgen/issues/3309). Instead, we
explicitly enumerate the supported kinds of double theories in this enum.
 */
pub(crate) enum DblTheoryWrapper {
    Discrete(Arc<theory::UstrDiscreteDblTheory>),
    DiscreteTab(Arc<theory::UstrDiscreteTabTheory>),
}

/** Wasm bindings for a double theory.
 */
#[wasm_bindgen]
pub struct DblTheory(pub(crate) DblTheoryWrapper);

#[wasm_bindgen]
impl DblTheory {
    pub(crate) fn from_discrete(theory: Arc<theory::UstrDiscreteDblTheory>) -> Self {
        Self(DblTheoryWrapper::Discrete(theory))
    }

    pub(crate) fn from_discrete_tabulator(theory: Arc<theory::UstrDiscreteTabTheory>) -> Self {
        Self(DblTheoryWrapper::DiscreteTab(theory))
    }

    /// Kind of double theory ("double doctrine").
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> String {
        // TODO: Should return an enum so that we get type defs.
        match &self.0 {
            DblTheoryWrapper::Discrete(_) => "Discrete",
            DblTheoryWrapper::DiscreteTab(_) => "DiscreteTab",
        }
        .into()
    }

    /// Source of a morphism type.
    #[wasm_bindgen]
    pub fn src(&self, mor_type: MorType) -> Result<ObType, String> {
        all_the_same!(match &self.0 {
            DblTheoryWrapper::[Discrete, DiscreteTab](th) => {
                let m = mor_type.try_into()?;
                Ok(th.src(&m).into())
            }
        })
    }

    /// Target of a morphism type.
    #[wasm_bindgen]
    pub fn tgt(&self, mor_type: MorType) -> Result<ObType, String> {
        all_the_same!(match &self.0 {
            DblTheoryWrapper::[Discrete, DiscreteTab](th) => {
                let m = mor_type.try_into()?;
                Ok(th.tgt(&m).into())
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

    /// Sets the index of a morphsim type.
    #[wasm_bindgen]
    pub fn set(&mut self, m: MorType, i: usize) {
        self.0.insert(m, i);
    }
}
