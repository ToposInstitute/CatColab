use std::process::{Child, Command, ExitStatus, Output, exit};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

static SHUTDOWN: AtomicBool = AtomicBool::new(false);

pub(crate) fn set_process_group(cmd: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
}

pub(crate) fn spawn_or_exit(mut cmd: Command, error_context: &str) -> Child {
    cmd.spawn().unwrap_or_else(|e| {
        eprintln!("Error: {error_context}: {e}");
        exit(1);
    })
}

pub(crate) fn status_or_exit(mut cmd: Command, error_context: &str) -> ExitStatus {
    cmd.status().unwrap_or_else(|e| {
        eprintln!("Error: {error_context}: {e}");
        exit(1);
    })
}

pub(crate) fn output_or_exit(mut cmd: Command, error_context: &str) -> Output {
    cmd.output().unwrap_or_else(|e| {
        eprintln!("Error: {error_context}: {e}");
        exit(1);
    })
}

pub(crate) fn ensure_success_or_exit(status: ExitStatus, error_message: &str) {
    if !status.success() {
        eprintln!("Error: {error_message}");
        exit(1);
    }
}

pub(crate) fn ensure_success_or_exit_with(status: ExitStatus, on_failure: impl FnOnce()) {
    if !status.success() {
        on_failure();
        exit(1);
    }
}

pub(crate) fn exec_or_exit(
    mut cmd: Command,
    exec_error_context: &str,
    start_error_context: &str,
    fallback_code: i32,
) -> ! {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let _ = (start_error_context, fallback_code);

        let err = cmd.exec();
        eprintln!("Error: {exec_error_context}: {err}");
        exit(1);
    }

    #[cfg(not(unix))]
    {
        let _ = exec_error_context;
        let status = status_or_exit(cmd, start_error_context);
        exit(status.code().unwrap_or(fallback_code));
    }
}

pub(crate) fn install_signal_handlers() {
    #[cfg(unix)]
    unsafe {
        libc::signal(libc::SIGINT, signal_handler as *const () as libc::sighandler_t);
        libc::signal(libc::SIGTERM, signal_handler as *const () as libc::sighandler_t);
    }

    #[cfg(not(unix))]
    {
        // On non-Unix platforms we rely on the default Ctrl-C behavior.
    }
}

#[cfg(unix)]
extern "C" fn signal_handler(_sig: libc::c_int) {
    SHUTDOWN.store(true, Ordering::SeqCst);
}

pub(crate) fn wait_for_child_pair_or_shutdown(backend: &mut Child, frontend: &mut Child) -> ! {
    loop {
        if SHUTDOWN.load(Ordering::SeqCst) {
            eprintln!("\n[catcom] Shutting down...");
            cleanup_child(backend);
            cleanup_child(frontend);
            exit(130);
        }
        if let Some(status) = backend.try_wait().unwrap_or(None) {
            eprintln!("[catcom] Backend exited with status: {status}");
            cleanup_child(frontend);
            exit(status.code().unwrap_or(1));
        }
        if let Some(status) = frontend.try_wait().unwrap_or(None) {
            cleanup_child(backend);
            exit(status.code().unwrap_or(0));
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn cleanup_child(child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;

        unsafe {
            libc::kill(-pid, libc::SIGTERM);
        }

        for _ in 0..20 {
            match child.try_wait() {
                Ok(Some(_)) => return,
                _ => thread::sleep(Duration::from_millis(100)),
            }
        }

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
