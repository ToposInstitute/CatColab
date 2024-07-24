//! Wasm bindings for double theories.

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Arc;
use ustr::Ustr;

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use catlog::dbl::theory::{self as dbl_theory, DblTheory};
use catlog::one::fin_category::*;

type UstrDiscreteDblThy = dbl_theory::DiscreteDblTheory<UstrFinCategory>;

// XXX: It seems like tsify should find the following on its own.
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen]
    fn tsFinHom() -> FinHom<Ustr, Ustr>;
}

/// Object type in discrete double theory.
#[derive(Eq, Hash, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ObType(pub Ustr);

/// Morphism type in discrete double theory.
#[derive(Eq, Hash, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MorType(pub FinHom<Ustr, Ustr>);

/** Wasm bindings for a discrete double theory.

Besides being a thin wrapper around the theory from `catlog`, this struct allows
numerical indices to be set for types in the theory, compensating for the lack
of hash maps with arbitrary keys in JavaScript.
*/
#[wasm_bindgen]
pub struct DiscreteDblTheory {
    pub(crate) theory: Arc<UstrDiscreteDblThy>,
    ob_type_index: HashMap<ObType, usize>,
    mor_type_index: HashMap<MorType, usize>,
}

#[wasm_bindgen]
impl DiscreteDblTheory {
    pub(crate) fn new(theory: Arc<UstrDiscreteDblThy>) -> DiscreteDblTheory {
        DiscreteDblTheory {
            theory,
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
    pub fn src(&self, m: MorType) -> ObType {
        ObType(self.theory.src(&m.0))
    }

    /// Target of a morphism type.
    #[wasm_bindgen]
    pub fn tgt(&self, m: MorType) -> ObType {
        ObType(self.theory.tgt(&m.0))
    }
}
