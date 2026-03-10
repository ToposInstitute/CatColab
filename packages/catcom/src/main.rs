//! CatColab developer CLI.

use std::env as std_env;
use std::process::{Child, exit};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

mod backend;
mod db;
mod env;
mod frontend;
mod process_management;
mod repo_root;

/// Global flag set by the SIGINT/SIGTERM handler to signal that catcom should
/// shut down its child processes and exit.
static SHUTDOWN: AtomicBool = AtomicBool::new(false);

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

/// Install signal handlers so that Ctrl-C (SIGINT) and SIGTERM set the
/// `SHUTDOWN` flag instead of killing catcom immediately. This lets the poll
/// loop clean up child process groups before exiting.
#[cfg(unix)]
fn install_signal_handlers() {
    unsafe {
        libc::signal(libc::SIGINT, signal_handler as *const () as libc::sighandler_t);
        libc::signal(libc::SIGTERM, signal_handler as *const () as libc::sighandler_t);
    }
}

#[cfg(unix)]
extern "C" fn signal_handler(_sig: libc::c_int) {
    SHUTDOWN.store(true, Ordering::SeqCst);
}

#[cfg(not(unix))]
fn install_signal_handlers() {
    // On non-Unix platforms we rely on the default Ctrl-C behavior.
}

/// Start both the backend and frontend for local development.
///
/// Both processes run in the foreground with interleaved output.
/// When either exits (or a shutdown signal is received), the other is killed.
fn dev_all() {
    let repo_root = repo_root::repo_root_or_exit();

    backend::setup_backend(&repo_root);
    frontend::setup_frontend(&repo_root);

    install_signal_handlers();

    let mut backend = backend::spawn_backend(&repo_root);
    let mut frontend = frontend::spawn_frontend(&repo_root, false, false);

    // Wait for either process to exit, then clean up the other.
    loop {
        if SHUTDOWN.load(Ordering::SeqCst) {
            eprintln!("\n[catcom] Shutting down...");
            cleanup_child(&mut backend);
            cleanup_child(&mut frontend);
            exit(130); // 128 + SIGINT
        }
        if let Some(status) = backend.try_wait().unwrap_or(None) {
            eprintln!("[catcom] Backend exited with status: {status}");
            cleanup_child(&mut frontend);
            exit(status.code().unwrap_or(1));
        }
        if let Some(status) = frontend.try_wait().unwrap_or(None) {
            cleanup_child(&mut backend);
            exit(status.code().unwrap_or(0));
        }
        thread::sleep(Duration::from_millis(100));
    }
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

/// Kill a child process and its entire process group, then wait for it to exit.
///
/// On Unix, sends SIGTERM to the process group first, waits up to 2 seconds for
/// a clean shutdown, then sends SIGKILL if the process is still alive.
fn cleanup_child(child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;

        // Send SIGTERM to the entire process group.
        unsafe {
            libc::kill(-pid, libc::SIGTERM);
        }

        // Give the process up to 2 seconds to exit gracefully.
        for _ in 0..20 {
            match child.try_wait() {
                Ok(Some(_)) => return,
                _ => thread::sleep(Duration::from_millis(100)),
            }
        }

        // Still alive — force kill the process group.
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
    }

    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }

    let _ = child.wait();
}
