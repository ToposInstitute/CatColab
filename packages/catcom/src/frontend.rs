use std::path::{Path, PathBuf};
use std::process::{Child, Command};

use crate::process_management::{
    ensure_success_or_exit, exec_or_exit, set_process_group, spawn_or_exit, status_or_exit,
};

pub(crate) fn setup_frontend(repo_root: &Path) {
    ensure_node_modules(repo_root);
    build_wasm(repo_root);
}

fn ensure_node_modules(repo_root: &Path) {
    let vite = vite_bin(repo_root);
    if vite.exists() {
        return;
    }

    println!("[catcom] Installing npm dependencies...");
    let mut cmd = Command::new("pnpm");
    cmd.args(["install"]).current_dir(repo_root);
    let status = status_or_exit(cmd, "failed to run pnpm install");
    ensure_success_or_exit(status, "pnpm install failed.");
}

fn build_wasm(repo_root: &Path) {
    let wasm_dir = repo_root.join("packages").join("catlog-wasm");

    println!("[catcom] Building catlog-wasm...");
    let mut cmd = Command::new("wasm-pack");
    cmd.args(["build", ".", "--target", "browser", "-d", "./dist/pkg-browser", "--debug"])
        .current_dir(&wasm_dir);
    let status = status_or_exit(cmd, "failed to run wasm-pack");
    ensure_success_or_exit(status, "wasm-pack build failed.");
}

fn frontend_vite_args(staging: bool, clear_screen: bool) -> Vec<&'static str> {
    let mut args = vec!["--host"];
    if staging {
        args.extend(["--mode", "staging"]);
    }
    if !clear_screen {
        args.push("--no-clearScreen");
    }
    args
}

fn vite_bin(repo_root: &Path) -> PathBuf {
    frontend_dir(repo_root).join("node_modules").join(".bin").join("vite")
}

pub(crate) fn spawn_frontend(repo_root: &Path, staging: bool, clear_screen: bool) -> Child {
    println!("[catcom] Starting frontend dev server ({})...", frontend_backend_label(staging));
    let args = frontend_vite_args(staging, clear_screen);
    let mut cmd = Command::new(vite_bin(repo_root));
    cmd.args(&args).current_dir(frontend_dir(repo_root));

    set_process_group(&mut cmd);
    spawn_or_exit(cmd, "failed to start frontend")
}

pub(crate) fn exec_frontend(repo_root: &Path, staging: bool) -> ! {
    println!("[catcom] Starting frontend dev server ({})...", frontend_backend_label(staging));
    let cwd = frontend_dir(repo_root);
    let args = frontend_vite_args(staging, true);
    let mut cmd = Command::new(vite_bin(repo_root));
    cmd.args(&args).current_dir(cwd);
    exec_or_exit(cmd, "failed to exec frontend", "failed to start frontend", 1)
}

fn frontend_dir(repo_root: &Path) -> PathBuf {
    repo_root.join("packages").join("frontend")
}

fn frontend_backend_label(staging: bool) -> &'static str {
    if staging {
        "staging backend"
    } else {
        "local backend"
    }
}
