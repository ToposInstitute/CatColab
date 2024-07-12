mod utils;

use std::hash::Hash;
use std::collections::HashMap;

use derivative::Derivative;
use ustr::{Ustr};
use wasm_bindgen::prelude::*;

use catlog::one::fin_category::*;
use catlog::dbl::theory::{self as dbl_theory, DblTheory};


/// Frontend metadata for a type in a discrete double theory.
#[wasm_bindgen(getter_with_clone)]
#[derive(Clone)]
pub struct TypeMeta {
    /// Unique identifier of the type.
    pub id: String,

    /// Human-readable name of the type.
    pub name: String,

    /// Human-readable description of the type.
    pub description: Option<String>,

    /// Main key to use in a keyboard shortcut for the type.
    pub key: Option<String>,
}

type CoreDiscreteDblTheory = dbl_theory::DiscreteDblTheory<UstrFinCategory>;
type ObType = Ob<Ustr>;
type MorType = Hom<Ustr, Ustr>;

/** Wasm wrapper for a discrete double theory.

TODO
 */
#[wasm_bindgen]
pub struct DiscreteDblTheory {
    theory: CoreDiscreteDblTheory,
    ob_types: TypesWithMeta<ObType>,
    mor_types: TypesWithMeta<MorType>,
}

#[wasm_bindgen]
impl DiscreteDblTheory {
    pub(crate) fn new(theory: CoreDiscreteDblTheory) -> DiscreteDblTheory {
        DiscreteDblTheory {
            theory: theory,
            ob_types: Default::default(), mor_types: Default::default(),
        }
    }

    /// Bind an object type with metadata.
    pub(crate) fn bind_ob_type(&mut self, typ: ObType, meta: TypeMeta) {
        self.ob_types.bind(typ, meta);
    }

    /// Bind a morphism type with metadata.
    pub(crate) fn bind_mor_type(&mut self, typ: MorType, meta: TypeMeta) {
        self.mor_types.bind(typ, meta);
    }

    /// Array of object types.
    #[wasm_bindgen(js_name = obTypes)]
    pub fn ob_types(&self) -> Vec<TypeMeta> {
        self.ob_types.meta.iter().cloned().collect()
    }

    /// Array of morphism types.
    #[wasm_bindgen(js_name = morTypes)]
    pub fn mor_types(&self) -> Vec<TypeMeta> {
        self.mor_types.meta.iter().cloned().collect()
    }

    /// Source of a morphism type.
    #[wasm_bindgen]
    pub fn src(&self, id: String) -> String {
        let src = self.theory.src(self.mor_types.typ(&id));
        self.ob_types.id(&src).clone()
    }

    /// Target of a morphism type.
    #[wasm_bindgen]
    pub fn tgt(&self, id: String) -> String {
        let tgt = self.theory.tgt(self.mor_types.typ(&id));
        self.ob_types.id(&tgt).clone()
    }
}

#[derive(Derivative)]
#[derivative(Default(bound=""))]
struct TypesWithMeta<T> {
    type_index: HashMap<T, usize>,
    id_index: HashMap<String, T>,
    meta: Vec<TypeMeta>,
}

impl<T> TypesWithMeta<T> where T: Eq+Hash+Clone {
    fn bind(&mut self, t: T, meta: TypeMeta) {
        let prev = self.type_index.insert(t.clone(), self.meta.len());
        assert!(prev.is_none());
        let prev = self.id_index.insert(meta.id.clone(), t.clone());
        assert!(prev.is_none());
        self.meta.push(meta);
    }

    fn get_id(&self, t: &T) -> Option<&String> {
        self.type_index.get(t).map(|i| &self.meta[*i].id)
    }
    fn get_type(&self, id: &String) -> Option<&T> {
        self.id_index.get(id)
    }

    fn id(&self, t: &T) -> &String {
        self.get_id(t).unwrap()
    }
    fn typ(&self, id: &String) -> &T {
        self.get_type(id).unwrap()
    }
}
