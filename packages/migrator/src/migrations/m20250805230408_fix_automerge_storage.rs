use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::process::ExitStatus;

pub(crate) struct FixAutomergeStorage;
#[async_trait::async_trait]
impl Migration<Postgres> for FixAutomergeStorage {
    fn app(&self) -> &str {
        "backend"
    }
    fn name(&self) -> &str {
        "20250805230408_fix_automerge_storage"
    }
    fn parents(&self) -> Vec<Box<dyn Migration<Postgres>>> {
        vec![]
    }
    fn operations(&self) -> Vec<Box<dyn Operation<Postgres>>> {
        vec_box![MigrationOperation]
    }

    fn is_atomic(&self) -> bool {
        false
    }
}

struct MigrationOperation;
#[async_trait::async_trait]
impl Operation<Postgres> for MigrationOperation {
    async fn up(&self, _: &mut PgConnection) -> Result<(), Error> {
        if env::var_os("INVOCATION_ID").is_some() {
            run_automerge_migration_during_deployment()?;
        } else {
            run_automerge_migration_during_development()?;
        }

        Ok(())
    }

    async fn down(&self, _: &mut PgConnection) -> Result<(), Error> {
        Ok(())
    }
}

fn run_automerge_migration_during_development()
-> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let cwd = env::current_dir().map_err(|e| format!("Failed to get current directory: {e}"))?;

    let git_root = find_git_root(&cwd).ok_or("No .git root found")?;

    let automerge_server_dir = git_root.join("packages").join("automerge-doc-server");

    let status = Command::new("npm")
        .args(["run", "main", "--", "--migrate", "fix_automerge_storage"])
        .current_dir(&automerge_server_dir)
        .status()?;

    check_status(status, "`npm run migrate-storage`")?;

    Ok(())
}

fn run_automerge_migration_during_deployment()
-> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let status = Command::new("automerge-doc-server")
        .args(["--migrate", "fix_automerge_storage"])
        .status()
        .map_err(|e| format!("Failed to run `automerge-doc-server`: {e}"))?;

    check_status(status, "`automerge-doc-server --migrate automerge_storage`")?;

    Ok(())
}

fn check_status(
    status: ExitStatus,
    command: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if status.success() {
        println!("{command} succeeded");
        Ok(())
    } else {
        Err(format!("{command} failed with exit code {:?}", status.code()).into())
    }
}

fn find_git_root(start: impl AsRef<Path>) -> Option<PathBuf> {
    let mut dir = start.as_ref().canonicalize().ok()?;

    loop {
        if dir.join(".git").is_dir() {
            return Some(dir);
        }

        if !dir.pop() {
            break;
        }
    }

    None
}
