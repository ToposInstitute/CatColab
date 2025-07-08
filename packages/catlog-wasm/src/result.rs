//! Result of fallible computation that translates to/from JavaScript.

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;

/** A `Result`-like type that translates to/from JavaScript.

In `wasm-bindgen`, returning a [`Result`] raises an exception in JavaScript when
the `Err` variant is given:

<https://rustwasm.github.io/docs/wasm-bindgen/reference/types/result.html>

When an error should be handled in the UI, it is often more convenient to return
an error value than to raise an exception. That's what this enum does.
*/
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum JsResult<T, E> {
    /// Contains the success value
    Ok(T),

    /// Contains the error value
    Err(E),
}

impl<T, E> From<Result<T, E>> for JsResult<T, E> {
    fn from(value: Result<T, E>) -> Self {
        match value {
            Result::Ok(x) => JsResult::Ok(x),
            Result::Err(x) => JsResult::Err(x),
        }
    }
}

impl<T> From<Option<T>> for JsResult<T, ()> {
    fn from(value: Option<T>) -> Self {
        match value {
            Option::Some(x) => JsResult::Ok(x),
            Option::None => JsResult::Err(()),
        }
    }
}
