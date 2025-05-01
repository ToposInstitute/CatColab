mod document;
mod notebook;
mod cell;
mod model_judgment;
mod diagram_judgment;
mod api;
mod path;
mod model;
mod theory;

#[cfg(test)]
mod test {
    use serde_json;
    use std::fs;
    use super::document::Document;

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
                }
                else {
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
