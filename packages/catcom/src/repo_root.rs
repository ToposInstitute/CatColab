use std::env;
use std::path::PathBuf;
use std::process::exit;

pub(crate) fn repo_root_or_exit() -> PathBuf {
    find_repo_root().unwrap_or_else(|| {
        eprintln!("Error: could not find repository root (no .git directory found).");
        exit(1);
    })
}

fn find_repo_root() -> Option<PathBuf> {
    let mut dir = env::current_dir().ok()?;
    loop {
        if dir.join(".git").exists() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}
