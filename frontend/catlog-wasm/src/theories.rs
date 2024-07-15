//! Wasm bindings for double theories from the standard library.

use wasm_bindgen::prelude::*;

use ustr::ustr;
use catlog::one::fin_category::*;
use catlog::stdlib::theories;
use super::theory::DiscreteDblTheory;


/// The theory of a (functional) olog a la Spivak and Kent.
#[wasm_bindgen(js_name = thSimpleOlog)]
pub fn th_category() -> DiscreteDblTheory {
    let mut th = DiscreteDblTheory::new(theories::th_category());
    th.bind_ob_type("type", Ob(ustr("x")));
    th.bind_mor_type("aspect", Hom::Id(ustr("x")));
    th
}

/// The theory of a schema (with data attributes).
#[wasm_bindgen(js_name = thSimpleSchema)]
pub fn th_schema() -> DiscreteDblTheory {
    let mut th = DiscreteDblTheory::new(theories::th_profunctor());
    th.bind_ob_type("entity", Ob(ustr("x")));
    th.bind_mor_type("map", Hom::Id(ustr("x")));
    th.bind_ob_type("attr_type", Ob(ustr("y")));
    th.bind_mor_type("attr_op", Hom::Id(ustr("y")));
    th.bind_mor_type("attr", Hom::Generator(ustr("p")));
    th
}

/// The theory of a signed category.
#[wasm_bindgen(js_name = thSignedCategory)]
pub fn th_signed_category() -> DiscreteDblTheory {
    let mut th = DiscreteDblTheory::new(theories::th_signed_category());
    th.bind_ob_type("object", Ob(ustr("x")));
    th.bind_mor_type("positive", Hom::Id(ustr("x")));
    th.bind_mor_type("negative", Hom::Generator(ustr("n")));
    th
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theories() {
        th_category();
        th_signed_category();

        let th = th_schema();
        assert_eq!(th.src("attr"), "entity");
        assert_eq!(th.tgt("attr"), "attr_type");
    }
}
