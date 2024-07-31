//! Wasm bindings for double theories from the standard library.

use wasm_bindgen::prelude::*;

use super::theory::DblTheory;
use catlog::stdlib::theories;

/// The theory of categories.
#[wasm_bindgen(js_name = thCategory)]
pub fn th_category() -> DblTheory {
    DblTheory::new(theories::th_category())
}

/// The theory of database schemas with attributes.
#[wasm_bindgen(js_name = thSchema)]
pub fn th_schema() -> DblTheory {
    DblTheory::new(theories::th_schema())
}

/// The theory of signed categories.
#[wasm_bindgen(js_name = thSignedCategory)]
pub fn th_signed_category() -> DblTheory {
    DblTheory::new(theories::th_signed_category())
}
