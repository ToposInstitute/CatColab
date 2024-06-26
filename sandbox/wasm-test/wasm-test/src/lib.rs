use js_sys;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub struct Counter {
    count: u32,
    callback: js_sys::Function,
}

#[wasm_bindgen]
impl Counter {
    #[wasm_bindgen(constructor)]
    pub fn new(cb: js_sys::Function) -> Self {
        Counter {
            count: 0,
            callback: cb,
        }
    }

    #[wasm_bindgen]
    pub fn incr(&mut self) {
        self.count += 1;
        let this = JsValue::null();
        self.callback
            .call1(&this, &JsValue::from(self.count))
            .unwrap();
    }

    #[wasm_bindgen(js_name=getCount)]
    pub fn get_count(&self) -> u32 {
        self.count
    }
}

#[wasm_bindgen]
pub fn greet(name: &str) {
    alert(&format!("Hello, {}!", name));
}
