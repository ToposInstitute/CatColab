use std::path::{Path, PathBuf};
use std::process::{Child, Command};

use crate::db::{
    default_pg_config, ensure_database_and_user, ensure_postgres_running, pg_config_from_env,
    pg_is_ready_at, prompt_pg_config,
};
use crate::env::{ensure_env_files, env_files_exist, load_env_file, write_env_files};
use crate::process_management::{
    ensure_success_or_exit, exec_or_exit, set_process_group, spawn_or_exit, status_or_exit,
};

pub(crate) fn setup_backend(repo_root: &Path) {
    let backend_env = backend_env_file(repo_root);
    let migrator_env = migrator_env_file(repo_root);
    let backend_env_development = backend_env_development_file(repo_root);
    let has_env = env_files_exist(&backend_env, &migrator_env);

    if !has_env && pg_is_ready_at("localhost", "5432") {
        let defaults = default_pg_config(&backend_env_development);
        let pg = prompt_pg_config(&defaults);
        let url = pg.to_url();

        let targets = [backend_env.clone(), migrator_env];
        write_env_files(repo_root, &backend_env_development, &targets, &url);
        load_env_file(&backend_env);
        ensure_database_and_user(&pg);
    } else {
        let targets = [backend_env.clone(), migrator_env];
        ensure_env_files(repo_root, &backend_env_development, &targets);
        load_env_file(&backend_env);

        let pg = pg_config_from_env();
        ensure_postgres_running(&pg);
        ensure_database_and_user(&pg);
    }

    run_migrations(repo_root);
    generate_bindings(repo_root);
}

pub(crate) fn spawn_backend(repo_root: &Path) -> Child {
    println!("[catcom] Starting backend server...");
    let mut cmd = Command::new("cargo");
    cmd.args(["run", "-p", "backend"]).current_dir(repo_root);
    set_process_group(&mut cmd);
    spawn_or_exit(cmd, "failed to start backend")
}

pub(crate) fn exec_backend(repo_root: &Path) -> ! {
    println!("[catcom] Starting backend server...");
    let mut cmd = Command::new("cargo");
    cmd.args(["run", "-p", "backend"]).current_dir(repo_root);
    exec_or_exit(cmd, "failed to exec backend", "failed to start backend", 1)
}

fn run_migrations(repo_root: &Path) {
    println!("[catcom] Running database migrations...");

    let mut cmd = Command::new("cargo");
    cmd.args(["run", "-p", "migrator", "--", "apply"]).current_dir(repo_root);
    let status = status_or_exit(cmd, "failed to run migrations");
    ensure_success_or_exit(status, "migrations failed.");
}

fn generate_bindings(repo_root: &Path) {
    println!("[catcom] Generating TypeScript bindings...");

    let mut cmd = Command::new("cargo");
    cmd.args(["run", "-p", "backend", "--", "generate-bindings"])
        .current_dir(repo_root);
    let status = status_or_exit(cmd, "failed to generate bindings");
    ensure_success_or_exit(status, "generating bindings failed.");
}

fn backend_env_file(repo_root: &Path) -> PathBuf {
    repo_root.join("packages").join("backend").join(".env")
}

fn backend_env_development_file(repo_root: &Path) -> PathBuf {
    repo_root.join("packages").join("backend").join(".env.development")
}

fn migrator_env_file(repo_root: &Path) -> PathBuf {
    repo_root.join("packages").join("migrator").join(".env")
}
