//! Wasm bindings for double theories from the standard library in `catlog`.

use wasm_bindgen::prelude::*;

use super::theory::DblTheory;
use catlog::stdlib::theories;

/// The theory of categories.
#[wasm_bindgen(js_name = thCategory)]
pub fn th_category() -> DblTheory {
    DblTheory::from_discrete(theories::th_category())
}

/// The theory of database schemas with attributes.
#[wasm_bindgen(js_name = thSchema)]
pub fn th_schema() -> DblTheory {
    DblTheory::from_discrete(theories::th_schema())
}

/// The theory of signed categories.
#[wasm_bindgen(js_name = thSignedCategory)]
pub fn th_signed_category() -> DblTheory {
    DblTheory::from_discrete(theories::th_signed_category())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theory::*;
    use ustr::ustr;

    #[test]
    fn discrete_dbl_theory() {
        let th = th_schema();
        let entity = ObType::Basic(ustr("entity"));
        let attr_type = ObType::Basic(ustr("attr_type"));
        let attr = MorType::Basic(ustr("attr"));
        assert_eq!(th.src(attr.clone()).unwrap(), entity);
        assert_eq!(th.tgt(attr).unwrap(), attr_type);
    }
}
