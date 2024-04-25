#[allow(unused_imports)]
use cats::*;

fn main() {
    specta::export::ts("types.d.ts").unwrap();
}
