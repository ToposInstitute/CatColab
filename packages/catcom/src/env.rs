use std::fs;
use std::path::{Path, PathBuf};
use std::process::exit;

pub(crate) fn env_files_exist(backend_env: &Path, migrator_env: &Path) -> bool {
    backend_env.exists() && migrator_env.exists()
}

pub(crate) fn read_env_var_from_file(path: &Path, key: &str) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=')
            && k.trim() == key
        {
            return Some(v.trim().to_string());
        }
    }
    None
}

pub(crate) fn write_env_files(
    repo_root: &Path,
    source: &Path,
    targets: &[PathBuf],
    database_url: &str,
) {
    let mut contents = format!("DATABASE_URL={database_url}\n");
    if source.exists()
        && let Ok(src) = fs::read_to_string(source)
    {
        for line in src.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                contents.push_str(line);
                contents.push('\n');
                continue;
            }
            if let Some((k, _)) = trimmed.split_once('=')
                && k.trim() != "DATABASE_URL"
            {
                contents.push_str(line);
                contents.push('\n');
            }
        }
    }

    for target in targets {
        let display_path = target.strip_prefix(repo_root).unwrap_or(target);
        println!("[catcom] Writing {}", display_path.display());
        fs::write(target, &contents).unwrap_or_else(|e| {
            eprintln!("Error: failed to write {}: {e}", display_path.display());
            exit(1);
        });
    }
}

pub(crate) fn ensure_env_files(repo_root: &Path, source: &Path, targets: &[PathBuf]) {
    if !source.exists() {
        eprintln!("Error: {} not found.", source.display());
        exit(1);
    }

    for target in targets {
        if !target.exists() {
            println!(
                "[catcom] Copying .env.development -> {}",
                target.strip_prefix(repo_root).unwrap_or(target).display()
            );
            fs::copy(source, target).unwrap_or_else(|e| {
                eprintln!("Error: failed to copy .env file: {e}");
                exit(1);
            });
        }
    }
}
