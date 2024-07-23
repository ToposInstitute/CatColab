pub mod theory;
pub mod theories;
pub mod model;

use wasm_bindgen::prelude::*;


/** Produce type defs for dependencies supporting `serde` but not `tsify`.

Somewhat amazingly, the type system in TypeScript can express the constraint
that an array be nonempty, with certain usage caveats:

https://stackoverflow.com/q/56006111

For now, though, we will not attempt to enforce this in the TypeScript layer.
 */
#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"
export type Uuid = string;
export type Ustr = string;

export type NonEmpty<T> = Array<T>;
"#;


pub fn set_panic_hook() {
    // When the `console_error_panic_hook` feature is enabled, we can call the
    // `set_panic_hook` function at least once during initialization, and then
    // we will get better error messages if our code ever panics.
    //
    // For more details see
    // https://github.com/rustwasm/console_error_panic_hook#readme
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
