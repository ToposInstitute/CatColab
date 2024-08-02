//! Wasm bindings for double theories.

use all_the_same::all_the_same;
use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Arc;
use ustr::Ustr;

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use catlog::dbl::theory::{self as dbl_theory, DblTheory as BaseDblTheory, TabMorType, TabObType};
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
[generics](https://github.com/rustwasm/wasm-bindgen/issues/3309).
 */
pub(crate) enum DblTheoryWrapper {
    Discrete(Arc<dbl_theory::UstrDiscreteDblTheory>),
    DiscreteTab(Arc<dbl_theory::UstrDiscreteTabTheory>),
}

/** Wasm bindings for a double theory.

Besides being a thin wrapper around a theory from `catlog`, this struct allows
numerical indices to be set for types in the theory, compensating for the lack
of hash maps with arbitrary keys in JavaScript.
*/
#[wasm_bindgen]
pub struct DblTheory {
    pub(crate) theory: DblTheoryWrapper,
    ob_type_index: HashMap<ObType, usize>,
    mor_type_index: HashMap<MorType, usize>,
}

#[wasm_bindgen]
impl DblTheory {
    pub(crate) fn new(theory: DblTheoryWrapper) -> Self {
        DblTheory {
            theory,
            ob_type_index: Default::default(),
            mor_type_index: Default::default(),
        }
    }

    pub(crate) fn from_discrete(theory: dbl_theory::UstrDiscreteDblTheory) -> Self {
        Self::new(DblTheoryWrapper::Discrete(Arc::new(theory)))
    }

    pub(crate) fn from_discrete_tabulator(theory: dbl_theory::UstrDiscreteTabTheory) -> Self {
        Self::new(DblTheoryWrapper::DiscreteTab(Arc::new(theory)))
    }

    /// Index of an object type, if set.
    #[wasm_bindgen(js_name = "obTypeIndex")]
    pub fn ob_type_index(&self, x: &ObType) -> Option<usize> {
        self.ob_type_index.get(x).copied()
    }

    /// Index of a morphism type, if set.
    #[wasm_bindgen(js_name = "morTypeIndex")]
    pub fn mor_type_index(&self, m: &MorType) -> Option<usize> {
        self.mor_type_index.get(m).copied()
    }

    /// Set the index of an object type.
    #[wasm_bindgen(js_name = "setObTypeIndex")]
    pub fn set_ob_type_index(&mut self, x: ObType, i: usize) {
        self.ob_type_index.insert(x, i);
    }

    /// Set the index of a morphism type.
    #[wasm_bindgen(js_name = "setMorTypeIndex")]
    pub fn set_mor_type_index(&mut self, m: MorType, i: usize) {
        self.mor_type_index.insert(m, i);
    }

    /// Source of a morphism type.
    #[wasm_bindgen]
    pub fn src(&self, mor_type: MorType) -> Result<ObType, String> {
        all_the_same!(match &self.theory {
            DblTheoryWrapper::[Discrete, DiscreteTab](th) => {
                let m = mor_type.try_into()?;
                Ok(th.src(&m).into())
            }
        })
    }

    /// Target of a morphism type.
    #[wasm_bindgen]
    pub fn tgt(&self, mor_type: MorType) -> Result<ObType, String> {
        all_the_same!(match &self.theory {
            DblTheoryWrapper::[Discrete, DiscreteTab](th) => {
                let m = mor_type.try_into()?;
                Ok(th.tgt(&m).into())
            }
        })
    }
}
