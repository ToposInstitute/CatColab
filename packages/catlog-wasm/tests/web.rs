//! Test suite for the Web and headless browsers.

#![cfg(target_arch = "wasm32")]

extern crate wasm_bindgen_test;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn pass() {
    assert_eq!(1 + 1, 2);
}


use catlog_wasm::theory::Theory;
use notebook_types::v0::theory::Theory as FrontendTheory;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode, Response, console};
use serde_json;

// Helper function to fetch frontend theory JSON from a presumed `/theories/` endpoint.
// This function mimics how a web application would load static assets.
async fn get_frontend_theory_json(theory_name: &str) -> Result<String, JsValue> {
    let mut opts = RequestInit::new();
    opts.method("GET");
    opts.mode(RequestMode::Cors); // Use CORS mode for fetching assets

    let url = format!("/theories/{}.json", theory_name); // Standard asset path
    console::log_1(&format!("[DEBUG] Fetching frontend theory from: {}", url).into());

    let request = Request::new_with_str_and_init(&url, &opts)?;

    let window = web_sys::window().expect("no window global");
    let resp_value = JsFuture::from(window.fetch_with_request(&request)).await?;

    // `resp_value` is a `Response` object. Convert to its concrete type.
    let resp: Response = resp_value.dyn_into().unwrap();

    // Check if the HTTP response indicates success (2xx status code).
    if !resp.ok() {
        let status = resp.status();
        let status_text = resp.status_text();
        return Err(JsValue::from_str(&format!(
            "HTTP error fetching {}: {} {}",
            url, status, status_text
        )));
    }

    // Get the response body as text.
    let text = JsFuture::from(resp.text()?).await?;
    Ok(text.as_string().unwrap_or_default())
}

#[wasm_bindgen_test]
async fn test_frontend_theory_type_validity() {
    // A predefined list of standard theory names to validate.
    // These names must correspond to both available Wasm theories and frontend JSON files.
    let standard_theory_names = vec![
        "Set",
        "Category",
        "Group",
        "Monoid",
        "Ring",
        // Add more standard theories here as they become part of the system.
    ];

    let mut errors: Vec<String> = Vec::new();

    for theory_name in standard_theory_names {
        console::log_1(&format!("--- Validating theory: '{}' ---", theory_name).into());

        // Step 1: Load the Wasm-bound theory.
        let wasm_theory = match Theory::load_from_std_lib(theory_name) {
            Ok(t) => t,
            Err(e) => {
                errors.push(format!(
                    "Failed to load Wasm theory '{}' from standard library: {:?}",
                    theory_name, e
                ));
                continue; // Skip to the next theory if Wasm loading fails
            }
        };

        // Step 2: Load the corresponding frontend theory definition (JSON).
        let frontend_theory_json_str = match get_frontend_theory_json(theory_name).await {
            Ok(json_str) => json_str,
            Err(e) => {
                errors.push(format!(
                    "Failed to fetch frontend theory JSON for '{}': {:?}",
                    theory_name, e
                ));
                continue; // Skip to the next theory if fetching JSON fails
            }
        };

        // Step 3: Deserialize the frontend theory JSON into the `notebook_types` struct.
        let frontend_theory: FrontendTheory = match serde_json::from_str(&frontend_theory_json_str) {
            Ok(t) => t,
            Err(e) => {
                errors.push(format!(
                    "Failed to deserialize frontend theory JSON for '{}': {:?}",
                    theory_name, e
                ));
                continue; // Skip to the next theory if deserialization fails
            }
        };

        // Step 4: Validate object types.
        // Iterate through `model_types` (frontend's object types) and check Wasm theory.
        for model_type_name in frontend_theory.model_types.keys() {
            if !wasm_theory.has_object_type(model_type_name) {
                errors.push(format!(
                    "Theory '{}': Frontend defines object type '{}', but Wasm theory does NOT have it.",
                    theory_name, model_type_name
                ));
            }
        }

        // Step 5: Validate morphism types.
        // Iterate through `instance_types` (frontend's morphism types) and check Wasm theory.
        for instance_type_name in frontend_theory.instance_types.keys() {
            if !wasm_theory.has_morphism_type(instance_type_name) {
                errors.push(format!(
                    "Theory '{}': Frontend defines morphism type '{}', but Wasm theory does NOT have it.",
                    theory_name, instance_type_name
                ));
            }
        }
    }

    // Report all collected errors and fail the test if any exist.
    if !errors.is_empty() {
        console::error_1(&"!!! Theory validation FAILED with the following discrepancies:".into());
        for error in &errors {
            console::error_1(&error.into());
        }
        panic!("Frontend/Wasm theory type mismatch detected! See console for details.");
    } else {
        console::log_1(&"All frontend theories and Wasm theories successfully validated. No type mismatches found.".into());
    }
}