//! CatColab developer CLI.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio, exit};
use std::thread;
use std::time::Duration;

use clap::{Parser, Subcommand};

/// CatColab developer CLI.
#[derive(Parser)]
#[command(name = "ccd", about = "CatColab developer CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Development commands.
    Dev {
        #[command(subcommand)]
        command: DevCommands,
    },
}

#[derive(Subcommand)]
enum DevCommands {
    /// Start the backend development environment.
    ///
    /// Ensures PostgreSQL is running, the database and user exist, .env files
    /// are in place, migrations are applied, TypeScript bindings are generated,
    /// and then starts the backend server.
    Backend,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Dev { command } => match command {
            DevCommands::Backend => dev_backend(),
        },
    }
}

/// Run the full backend dev setup and start the server.
fn dev_backend() {
    let repo_root = find_repo_root().unwrap_or_else(|| {
        eprintln!("Error: could not find repository root (no .git directory found).");
        exit(1);
    });

    ensure_postgres_running();
    ensure_database_and_user();
    ensure_env_files(&repo_root);
    run_migrations(&repo_root);
    generate_bindings(&repo_root);
    start_backend(&repo_root);
}

// ---------------------------------------------------------------------------
// PostgreSQL management
// ---------------------------------------------------------------------------

/// Return the pgdata directory path: `~/.local/share/catcolab/pgdata`.
fn pgdata_dir() -> PathBuf {
    let data_dir = env::var("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|_| {
        let home = env::var("HOME").expect("HOME environment variable is not set");
        PathBuf::from(home).join(".local").join("share")
    });
    data_dir.join("catcolab").join("pgdata")
}

/// Check if PostgreSQL is accepting connections on localhost:5432.
fn pg_is_ready() -> bool {
    Command::new("pg_isready")
        .args(["-h", "localhost", "-p", "5432"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Ensure a local PostgreSQL instance is running.
///
/// If postgres is already running (on localhost:5432), this is a no-op.
/// Otherwise, initializes a data directory if needed and starts postgres.
fn ensure_postgres_running() {
    if pg_is_ready() {
        println!("[ccd] PostgreSQL is already running.");
        return;
    }

    let pgdata = pgdata_dir();
    println!("[ccd] PostgreSQL is not running. Using data directory: {}", pgdata.display());

    // Initialize the data directory if it doesn't exist.
    if !pgdata.join("PG_VERSION").exists() {
        println!("[ccd] Initializing PostgreSQL data directory...");
        fs::create_dir_all(&pgdata).unwrap_or_else(|e| {
            eprintln!("Error: failed to create pgdata directory: {e}");
            exit(1);
        });

        let status = Command::new("initdb")
            .args(["-D", &pgdata.to_string_lossy(), "--no-locale", "-E", "UTF8", "--auth=trust"])
            .status()
            .unwrap_or_else(|e| {
                eprintln!("Error: failed to run initdb: {e}");
                exit(1);
            });

        if !status.success() {
            eprintln!("Error: initdb failed.");
            exit(1);
        }
    }

    let logfile = pgdata.join("logfile");
    println!("[ccd] Starting PostgreSQL...");

    let status = Command::new("pg_ctl")
        .args([
            "-D",
            &pgdata.to_string_lossy(),
            "-l",
            &logfile.to_string_lossy(),
            "-o",
            &format!("-h localhost -p 5432 -k {}", pgdata.display()),
            "start",
        ])
        .status()
        .unwrap_or_else(|e| {
            eprintln!("Error: failed to run pg_ctl: {e}");
            exit(1);
        });

    if !status.success() {
        eprintln!("Error: pg_ctl start failed. Check logs at: {}", logfile.display());
        exit(1);
    }

    // Wait for postgres to become ready.
    print!("[ccd] Waiting for PostgreSQL to start");
    for _ in 0..50 {
        if pg_is_ready() {
            println!(" ready.");
            return;
        }
        print!(".");
        thread::sleep(Duration::from_millis(200));
    }

    eprintln!("\nError: PostgreSQL did not become ready in time.");
    eprintln!("Check logs at: {}", logfile.display());
    exit(1);
}

/// Ensure the `catcolab` user and database exist.
fn ensure_database_and_user() {
    println!("[ccd] Ensuring database user and database exist...");

    // Create the catcolab user if it doesn't exist.
    // We connect as the current system user to the default `postgres` database.
    let create_user_sql = "\
        DO $$ BEGIN \
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'catcolab') THEN \
                CREATE ROLE catcolab WITH LOGIN PASSWORD 'password'; \
            END IF; \
        END $$;";

    run_psql("postgres", create_user_sql);

    // Create the catcolab database if it doesn't exist.
    // We check first because CREATE DATABASE can't be inside a transaction block.
    let check = Command::new("psql")
        .args([
            "-h",
            "localhost",
            "-p",
            "5432",
            "-d",
            "postgres",
            "-tAc",
            "SELECT 1 FROM pg_database WHERE datname = 'catcolab'",
        ])
        .output()
        .unwrap_or_else(|e| {
            eprintln!("Error: failed to check for database: {e}");
            exit(1);
        });

    let exists = String::from_utf8_lossy(&check.stdout).trim().contains('1');

    if !exists {
        println!("[ccd] Creating database 'catcolab'...");
        let status = Command::new("createdb")
            .args(["-h", "localhost", "-p", "5432", "-O", "catcolab", "catcolab"])
            .status()
            .unwrap_or_else(|e| {
                eprintln!("Error: failed to run createdb: {e}");
                exit(1);
            });

        if !status.success() {
            eprintln!("Error: createdb failed.");
            exit(1);
        }
    }

    // Ensure the catcolab user owns the database and has schema permissions.
    run_psql("catcolab", "GRANT ALL ON SCHEMA public TO catcolab;");

    println!("[ccd] Database ready.");
}

/// Run a SQL statement via psql against the given database.
fn run_psql(database: &str, sql: &str) {
    let status = Command::new("psql")
        .args(["-h", "localhost", "-p", "5432", "-d", database, "-c", sql])
        .stdout(Stdio::null())
        .status()
        .unwrap_or_else(|e| {
            eprintln!("Error: failed to run psql: {e}");
            exit(1);
        });

    if !status.success() {
        eprintln!("Error: psql command failed: {sql}");
        exit(1);
    }
}

// ---------------------------------------------------------------------------
// Environment files
// ---------------------------------------------------------------------------

/// Ensure `.env` files exist in `packages/backend/` and `packages/migrator/`.
fn ensure_env_files(repo_root: &Path) {
    let source = repo_root.join("packages").join("backend").join(".env.development");

    if !source.exists() {
        eprintln!("Error: {} not found.", source.display());
        exit(1);
    }

    let targets = [
        repo_root.join("packages").join("backend").join(".env"),
        repo_root.join("packages").join("migrator").join(".env"),
    ];

    for target in &targets {
        if !target.exists() {
            println!(
                "[ccd] Copying .env.development -> {}",
                target.strip_prefix(repo_root).unwrap_or(target).display()
            );
            fs::copy(&source, target).unwrap_or_else(|e| {
                eprintln!("Error: failed to copy .env file: {e}");
                exit(1);
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Migrations and bindings
// ---------------------------------------------------------------------------

/// Run database migrations.
fn run_migrations(repo_root: &Path) {
    println!("[ccd] Running database migrations...");

    let status = Command::new("cargo")
        .args(["run", "-p", "migrator", "--", "apply"])
        .current_dir(repo_root)
        .status()
        .unwrap_or_else(|e| {
            eprintln!("Error: failed to run migrations: {e}");
            exit(1);
        });

    if !status.success() {
        eprintln!("Error: migrations failed.");
        exit(1);
    }
}

/// Generate TypeScript bindings for the RPC API.
fn generate_bindings(repo_root: &Path) {
    println!("[ccd] Generating TypeScript bindings...");

    let status = Command::new("cargo")
        .args(["run", "-p", "backend", "--", "generate-bindings"])
        .current_dir(repo_root)
        .status()
        .unwrap_or_else(|e| {
            eprintln!("Error: failed to generate bindings: {e}");
            exit(1);
        });

    if !status.success() {
        eprintln!("Error: generating bindings failed.");
        exit(1);
    }
}

// ---------------------------------------------------------------------------
// Start the backend
// ---------------------------------------------------------------------------

/// Start the backend server, replacing the current process.
fn start_backend(repo_root: &Path) {
    println!("[ccd] Starting backend server...");

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;

        let err = Command::new("cargo")
            .args(["run", "-p", "backend"])
            .current_dir(repo_root)
            .exec();

        // exec() only returns on error.
        eprintln!("Error: failed to exec backend: {err}");
        exit(1);
    }

    #[cfg(not(unix))]
    {
        let status = Command::new("cargo")
            .args(["run", "-p", "backend"])
            .current_dir(repo_root)
            .status()
            .unwrap_or_else(|e| {
                eprintln!("Error: failed to start backend: {e}");
                exit(1);
            });

        if !status.success() {
            exit(status.code().unwrap_or(1));
        }
    }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/// Walk up from the current directory to find the repository root (containing `.git`).
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
