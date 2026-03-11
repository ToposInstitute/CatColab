//! CatColab developer CLI.

use std::env as std_env;
use std::process::exit;

mod backend;
mod db;
mod env;
mod frontend;
mod process_management;
mod repo_root;

use clap::{Parser, Subcommand};

/// CatColab developer CLI.
#[derive(Parser)]
#[command(name = "catcom", about = "CatColab development commands")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the development environment.
    ///
    /// With no subcommand, starts both the backend and frontend.
    /// With --staging, starts only the frontend against the staging backend.
    Dev {
        /// Use the staging backend instead of a local one.
        #[arg(long)]
        staging: bool,

        #[command(subcommand)]
        command: Option<DevCommands>,
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

    /// Start the frontend development server.
    ///
    /// Runs the Vite dev server for the frontend. By default, the frontend
    /// expects a local backend on port 8000. Use --staging to connect to the
    /// staging backend instead.
    Frontend {
        /// Use the staging backend instead of a local one.
        #[arg(long)]
        staging: bool,
    },
}

fn main() {
    // Default RUST_LOG to show backend debug logs if not already set.
    // SAFETY: This runs at the start of main before any threads are spawned.
    if std_env::var_os("RUST_LOG").is_none() {
        unsafe { std_env::set_var("RUST_LOG", "backend=debug") };
    }

    let cli = Cli::parse();

    match cli.command {
        Commands::Dev { staging, command } => match command {
            Some(DevCommands::Backend) => {
                if staging {
                    eprintln!("Error: --staging is not supported with the backend subcommand.");
                    exit(1);
                }
                dev_backend();
            }
            Some(DevCommands::Frontend { staging: frontend_staging }) => {
                dev_frontend(staging || frontend_staging);
            }
            None if staging => {
                dev_frontend(true);
            }
            None => {
                dev_all();
            }
        },
    }
}

// ---------------------------------------------------------------------------
// Top-level dev commands
// ---------------------------------------------------------------------------

/// Start both the backend and frontend for local development.
///
/// Both processes run in the foreground with interleaved output.
/// When either exits (or a shutdown signal is received), the other is killed.
fn dev_all() {
    let repo_root = repo_root::repo_root_or_exit();

    backend::setup_backend(&repo_root);
    frontend::setup_frontend(&repo_root);

    process_management::install_signal_handlers();

    let mut backend = backend::spawn_backend(&repo_root);
    let mut frontend = frontend::spawn_frontend(&repo_root, false, false);

    process_management::wait_for_child_pair_or_shutdown(&mut backend, &mut frontend)
}

/// Run the full backend dev setup and exec into the server.
fn dev_backend() {
    let repo_root = repo_root::repo_root_or_exit();

    backend::setup_backend(&repo_root);
    backend::exec_backend(&repo_root);
}

/// Exec into the frontend dev server.
fn dev_frontend(staging: bool) {
    let repo_root = repo_root::repo_root_or_exit();

    frontend::setup_frontend(&repo_root);
    frontend::exec_frontend(&repo_root, staging);
}
