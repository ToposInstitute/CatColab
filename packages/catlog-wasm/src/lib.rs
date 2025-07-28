#![allow(
    clippy::must_use_candidate,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::wildcard_imports,
    clippy::default_trait_access,
    clippy::manual_string_new,
    clippy::needless_pass_by_value,
    clippy::match_wildcard_for_single_variants,
    clippy::explicit_iter_loop,
    clippy::redundant_closure_for_method_calls,
    clippy::cloned_instead_of_copied
)]

pub mod notation;
pub mod result;

pub mod model;
pub mod model_diagram;
pub mod model_morphism;
pub mod theory;

pub mod analyses;
#[allow(clippy::new_without_default)]
pub mod theories;

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

#[wasm_bindgen]
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
