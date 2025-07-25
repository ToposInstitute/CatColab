use serde::de::DeserializeOwned;
use std::fs;
use std::path::Path;

/// Generic test runner for validating example files.
///
/// - `T`: Type to deserialize to
/// - `dir`: Directory containing example files
/// - `check`: A function that will be called for each deserialized file
pub fn test_example_documents<T, F>(dir: &str, mut check: F)
where
    T: DeserializeOwned,
    F: FnMut(T, &Path),
{
    let path = Path::new(dir);
    assert!(path.exists(), "Directory {dir} does not exist");

    let mut errored = false;

    for entry in fs::read_dir(path).unwrap() {
        if let Ok(e) = entry {
            let file_path = e.path();

            match fs::read_to_string(&file_path) {
                Ok(content) => match serde_json::from_str::<T>(&content) {
                    Ok(doc) => {
                        check(doc, &file_path);
                    }
                    Err(err) => {
                        eprintln!("Failed to deserialize {}: {err}", file_path.display());
                        errored = true;
                    }
                },
                Err(err) => {
                    eprintln!("Failed to read {}: {err}", file_path.display());
                    errored = true;
                }
            }
        }
    }

    if errored {
        panic!("One or more example files failed to deserialize");
    }
}
