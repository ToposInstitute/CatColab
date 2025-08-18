pub mod analysis;
pub mod api;
pub mod cell;
pub mod diagram_judgment;
pub mod document;
pub mod model;
pub mod model_judgment;
pub mod notebook;
pub mod path;
pub mod theory;

pub use analysis::*;
pub use api::*;
pub use cell::*;
pub use diagram_judgment::*;
pub use document::*;
pub use model::*;
pub use model_judgment::*;
pub use notebook::*;
pub use theory::*;

#[cfg(test)]
mod test {
    use super::document::Document;
    use serde_json;
    use std::fs;

    #[test]
    fn test_v0_examples() {
        let mut errored = false;
        for f in fs::read_dir("examples/v0").unwrap() {
            if let Ok(e) = f {
                if let Ok(s) = fs::read_to_string(e.path()) {
                    match serde_json::from_str::<Document>(&s) {
                        Ok(_) => {}
                        Err(err) => {
                            eprintln!("got {err} when reading {}", e.path().to_str().unwrap());
                            errored = true;
                        }
                    }
                } else {
                    eprintln!("couldn't read {}", e.path().to_str().unwrap());
                    errored = true;
                }
            }
        }
        if errored {
            panic!()
        }
    }
}
