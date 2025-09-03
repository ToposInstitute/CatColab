use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::process::ExitStatus;

pub(crate) struct AutomergeStorage;
#[async_trait::async_trait]
impl Migration<Postgres> for AutomergeStorage {
    fn app(&self) -> &str {
        "backend"
    }
    fn name(&self) -> &str {
        "20250516154702_automerge_storage"
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
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        // This up migration is not able to be run inside a transaction because it's calling an external
        // script, so we have to handle rollback on failure ourselves. Fortunately the use of IF EXISTS
        // in the down migration means that it will handle the cleanup regardless of where the up
        // migratoin fails
        let inner: Result<(), Error> = async {
            sqlx::query(
                "
                CREATE TABLE storage (
                    key text[] PRIMARY KEY,
                    data bytea NOT NULL
                );
                ",
            )
            .execute(&mut *conn)
            .await?;

            sqlx::query(
                "
                ALTER TABLE snapshots ADD COLUMN doc_id TEXT;
                ",
            )
            .execute(&mut *conn)
            .await?;

            // INVOCATION_ID will be set when the program is running from inside a systemd container
            if env::var_os("INVOCATION_ID").is_some() {
                run_automerge_migration_during_deployment()?;
            } else {
                run_automerge_migration_during_development()?;
            }

            sqlx::query(
                "
                ALTER TABLE snapshots ALTER COLUMN doc_id SET NOT NULL;
                ",
            )
            .execute(&mut *conn)
            .await?;

            Ok(())
        }
        .await;

        match inner {
            Ok(()) => Ok(()),
            Err(e) => {
                self.down(conn).await?;
                Err(e)
            }
        }
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query(
            "
            DROP TABLE IF EXISTS storage;
            ",
        )
        .execute(&mut *conn)
        .await?;

        sqlx::query(
            "
            ALTER TABLE snapshots DROP COLUMN IF EXISTS doc_id;
            ",
        )
        .execute(&mut *conn)
        .await?;

        Ok(())
    }
}

fn run_automerge_migration_during_development()
-> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let cwd = env::current_dir().map_err(|e| format!("Failed to get current directory: {e}"))?;

    let git_root = find_git_root(&cwd).ok_or("No .git root found")?;

    let automerge_server_dir = git_root.join("packages").join("automerge-doc-server");

    let status = Command::new("npm")
        .args(["run", "main", "--", "--migrate", "automerge_storage"])
        .current_dir(&automerge_server_dir)
        .status()
        .map_err(|e| format!("Failed to run `npm run migrate-storage`: {e}"))?;

    check_status(status, "`npm run migrate-storage`")?;

    Ok(())
}

fn run_automerge_migration_during_deployment()
-> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let status = Command::new("automerge-doc-server")
        .args(["--migrate", "automerge_storage"])
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
