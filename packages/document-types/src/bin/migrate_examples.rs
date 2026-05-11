use catcolab_document_types::{CURRENT_VERSION, VersionedDocument};
use std::fs;
use std::path::Path;

/// Migrate the most recent previous-version example documents to the current
/// version.
///
/// The input directory is `examples/v{CURRENT_VERSION - 1}` and the output
/// directory is `examples/v{CURRENT_VERSION}`.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let current: u32 = CURRENT_VERSION.parse()?;
    let previous = current.checked_sub(1).ok_or("there is no previous version to migrate from")?;

    let input_dir_path = format!("examples/v{previous}");
    let output_dir_path = format!("examples/v{current}");
    let input_dir = Path::new(&input_dir_path);
    let output_dir = Path::new(&output_dir_path);

    fs::create_dir_all(output_dir)?;

    for entry in fs::read_dir(input_dir)? {
        let path = entry?.path();

        let content = fs::read_to_string(&path)?;
        let doc: VersionedDocument = serde_json::from_str(&content)?;

        let current_doc = doc.to_current();
        let migrated_json = serde_json::to_string(&current_doc)?;

        let output_path = output_dir.join(path.file_name().unwrap());
        fs::write(&output_path, migrated_json)?;

        println!("Migrated: {:?}", path.file_name().unwrap());
    }

    Ok(())
}
