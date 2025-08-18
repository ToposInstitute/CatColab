use notebook_types::VersionedDocument;
use std::fs;
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input_dir = Path::new("examples/v0");
    let output_dir = Path::new("examples/v1");

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
