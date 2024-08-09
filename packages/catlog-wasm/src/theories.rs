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

/// The theory of categories with links.
#[wasm_bindgen(js_name = thCategoryLinks)]
pub fn th_category_links() -> DblTheory {
    DblTheory::from_discrete_tabulator(theories::th_category_links())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theory::*;
    use ustr::ustr;

    #[test]
    fn discrete_dbl_theory() {
        let th = th_schema();
        let entity = ObType::Basic(ustr("Entity"));
        let attr_type = ObType::Basic(ustr("AttrType"));
        let attr = MorType::Basic(ustr("Attr"));
        assert_eq!(th.src(attr.clone()), Ok(entity));
        assert_eq!(th.tgt(attr), Ok(attr_type));
    }

    #[test]
    fn discrete_tab_theory() {
        let th = th_category_links();
        let x = ObType::Basic(ustr("Object"));
        let link = MorType::Basic(ustr("Link"));
        assert_eq!(th.src(link.clone()), Ok(x));
        assert!(matches!(th.tgt(link), Ok(ObType::Tabulator(_))));
    }
}
