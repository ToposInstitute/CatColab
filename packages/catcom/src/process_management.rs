use std::process::{Child, Command, ExitStatus, Output, exit};

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
