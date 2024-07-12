//! Wasm bindings for double theories.

use std::hash::Hash;
use std::collections::HashMap;
use derivative::Derivative;

use wasm_bindgen::prelude::*;

use ustr::{Ustr};
use catlog::one::fin_category::*;
use catlog::dbl::theory::{self as dbl_theory, DblTheory};


type UstrDiscreteDblThy = dbl_theory::DiscreteDblTheory<UstrFinCategory>;
type ObType = Ob<Ustr>;
type MorType = Hom<Ustr, Ustr>;

/** Wasm bindings for a discrete double theory.

All object and morphism types (both basic and homs) are assigned string
identifiers for JavaScript.
 */
#[wasm_bindgen]
pub struct DiscreteDblTheory {
    theory: &'static UstrDiscreteDblThy,
    ob_types: JsIdMap<ObType>,
    mor_types: JsIdMap<MorType>,
}

#[wasm_bindgen]
impl DiscreteDblTheory {
    pub(crate) fn new(theory: &'static UstrDiscreteDblThy) -> DiscreteDblTheory {
        DiscreteDblTheory {
            theory: theory,
            ob_types: Default::default(), mor_types: Default::default(),
        }
    }

    /// Bind an object type with metadata.
    pub(crate) fn bind_ob_type(&mut self, id: &str, ob_type: ObType) {
        assert!(self.theory.has_ob_type(&ob_type));
        self.ob_types.bind(id.to_string(), ob_type);
    }

    /// Bind a morphism type with metadata.
    pub(crate) fn bind_mor_type(&mut self, id: &str, mor_type: MorType) {
        assert!(self.theory.has_mor_type(&mor_type));
        self.mor_types.bind(id.to_string(), mor_type);
    }

    /// Array of object types.
    #[wasm_bindgen(js_name = obTypes)]
    pub fn ob_types(&self) -> Vec<String> {
        self.ob_types.iter_ids().cloned().collect()
    }

    /// Array of morphism types.
    #[wasm_bindgen(js_name = morTypes)]
    pub fn mor_types(&self) -> Vec<String> {
        self.mor_types.iter_ids().cloned().collect()
    }

    /// Source of a morphism type.
    #[wasm_bindgen]
    pub fn src(&self, id: &str) -> String {
        let src = self.theory.src(self.mor_types.by_id(id));
        self.ob_types.id_of(&src).clone()
    }

    /// Target of a morphism type.
    #[wasm_bindgen]
    pub fn tgt(&self, id: &str) -> String {
        let tgt = self.theory.tgt(self.mor_types.by_id(id));
        self.ob_types.id_of(&tgt).clone()
    }
}


/// Bidirectional mapping with JavaScript-friendly identifiers (strings).
#[derive(Derivative)]
#[derivative(Default(bound=""))]
struct JsIdMap<T> {
    from_id: HashMap<String, T>,
    to_id: HashMap<T, String>,
}

impl<T> JsIdMap<T> where T: Eq+Hash+Clone {
    fn bind(&mut self, id: String, x: T) {
        let prev = self.from_id.insert(id.clone(), x.clone());
        assert!(prev.is_none());
        let prev = self.to_id.insert(x, id);
        assert!(prev.is_none());
    }

    fn get_id_of(&self, x: &T) -> Option<&String> { self.to_id.get(x) }
    fn get_by_id(&self, id: &str) -> Option<&T> { self.from_id.get(id) }

    fn id_of(&self, t: &T) -> &String { self.get_id_of(t).unwrap() }
    fn by_id(&self, id: &str) -> &T { self.get_by_id(id).unwrap() }

    fn iter_ids(&self) -> impl Iterator<Item = &String> {
        self.from_id.keys()
    }
}
