//! Wasm bindings for double theories.

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Arc;
use ustr::Ustr;

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use catlog::dbl::theory::{self as dbl_theory, DblTheory as BaseDblTheory};
use catlog::one::fin_category::*;

/// Object type in a double theory.
#[derive(Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ObType {
    /// Basic or generating object type.
    Basic(Ustr),

    /// Tabulator of a morphism type.
    Tabulator(Box<MorType>),
}

/// Morphism type in a double theory.
#[derive(Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum MorType {
    /// Basic or generating morphism type.
    Basic(Ustr),

    /// Hom type on an object type.
    Hom(Box<ObType>),
}

/// Convert from object type in discrete double theory.
impl From<Ustr> for ObType {
    fn from(value: Ustr) -> Self {
        ObType::Basic(value)
    }
}

/// Convert from morphism type in discrete double theory.
impl From<FinHom<Ustr, Ustr>> for MorType {
    fn from(hom: FinHom<Ustr, Ustr>) -> Self {
        match hom {
            FinHom::Generator(e) => MorType::Basic(e),
            FinHom::Id(v) => MorType::Hom(Box::new(ObType::Basic(v))),
        }
    }
}

/// Convert to object type in discrete double theory.
impl TryFrom<ObType> for Ustr {
    type Error = ();

    fn try_from(ob_type: ObType) -> Result<Self, Self::Error> {
        match ob_type {
            ObType::Basic(name) => Ok(name),
            _ => Err(()),
        }
    }
}

/// Convert to morphism type in discrete double theory.
impl TryFrom<MorType> for FinHom<Ustr, Ustr> {
    type Error = ();

    fn try_from(mor_type: MorType) -> Result<Self, Self::Error> {
        match mor_type {
            MorType::Basic(name) => Ok(FinHom::Generator(name)),
            MorType::Hom(ob_type) => (*ob_type).try_into().map(FinHom::Id),
        }
    }
}

#[allow(dead_code)]
trait BindableDblTheory:
    dbl_theory::DblTheory<ObType = Self::BindableObType, MorType = Self::BindableMorType>
{
    type BindableObType: Into<ObType> + TryFrom<ObType, Error = ()>;
    type BindableMorType: Into<MorType> + TryFrom<MorType, Error = ()>;
}

impl BindableDblTheory for dbl_theory::UstrDiscreteDblThy {
    type BindableObType = Ustr;
    type BindableMorType = FinHom<Ustr, Ustr>;
}

/** Wasm bindings for a double theory.

Besides being a thin wrapper around a theory from `catlog`, this struct allows
numerical indices to be set for types in the theory, compensating for the lack
of hash maps with arbitrary keys in JavaScript.
*/
#[wasm_bindgen]
pub struct DblTheory {
    pub(crate) theory: Arc<dbl_theory::UstrDiscreteDblThy>,
    ob_type_index: HashMap<ObType, usize>,
    mor_type_index: HashMap<MorType, usize>,
}

#[wasm_bindgen]
impl DblTheory {
    pub(crate) fn new(theory: dbl_theory::UstrDiscreteDblThy) -> DblTheory {
        DblTheory {
            theory: Arc::new(theory),
            ob_type_index: Default::default(),
            mor_type_index: Default::default(),
        }
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
    pub fn src(&self, mor_type: MorType) -> Option<ObType> {
        let m = mor_type.try_into().ok()?;
        Some(self.theory.src(&m).into())
    }

    /// Target of a morphism type.
    #[wasm_bindgen]
    pub fn tgt(&self, mor_type: MorType) -> Option<ObType> {
        let m = mor_type.try_into().ok()?;
        Some(self.theory.tgt(&m).into())
    }
}
