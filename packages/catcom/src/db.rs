use std::env;
use std::fs;
use std::io::{self, BufRead, Write as _};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio, exit};
use std::thread;
use std::time::Duration;

use crate::env::read_env_var_from_file;
use crate::process_management::{
    ensure_success_or_exit, ensure_success_or_exit_with, output_or_exit, status_or_exit,
};

pub(crate) struct PgConfig {
    pub(crate) host: String,
    pub(crate) port: String,
    pub(crate) user: String,
    pub(crate) password: String,
    pub(crate) dbname: String,
}

impl PgConfig {
    pub(crate) fn to_url(&self) -> String {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            self.user, self.password, self.host, self.port, self.dbname
        )
    }
}

pub(crate) fn pg_config_from_env_file(path: &Path) -> PgConfig {
    let url = read_env_var_from_file(path, "DATABASE_URL").unwrap_or_else(|| {
        eprintln!("Error: DATABASE_URL is not set in {}.", path.display());
        exit(1);
    });

    parse_database_url(&url)
}

pub(crate) fn parse_database_url(url: &str) -> PgConfig {
    let rest = url
        .strip_prefix("postgres://")
        .or_else(|| url.strip_prefix("postgresql://"))
        .unwrap_or_else(|| {
            eprintln!("Error: DATABASE_URL must start with postgres:// or postgresql://");
            exit(1);
        });

    let (authority, dbname) = rest.split_once('/').unwrap_or_else(|| {
        eprintln!("Error: DATABASE_URL is missing the database name (expected /dbname).");
        exit(1);
    });

    let (userinfo, hostport) = authority.split_once('@').unwrap_or_else(|| {
        eprintln!("Error: DATABASE_URL is missing '@' separator.");
        exit(1);
    });

    let (user, password) = userinfo.split_once(':').unwrap_or((userinfo, ""));

    let (host, port) = if hostport.contains(':') {
        let (h, p) = hostport.split_once(':').unwrap();
        (h.to_string(), p.to_string())
    } else {
        (hostport.to_string(), "5432".to_string())
    };

    PgConfig {
        host,
        port,
        user: user.to_string(),
        password: password.to_string(),
        dbname: dbname.to_string(),
    }
}

pub(crate) fn default_pg_config(source: &Path) -> PgConfig {
    if source.exists()
        && let Some(url) = read_env_var_from_file(source, "DATABASE_URL")
    {
        return parse_database_url(&url);
    }
    PgConfig {
        host: "localhost".to_string(),
        port: "5432".to_string(),
        user: "catcolab".to_string(),
        password: "password".to_string(),
        dbname: "catcolab".to_string(),
    }
}

pub(crate) fn prompt_pg_config(defaults: &PgConfig) -> PgConfig {
    println!("[catcom] PostgreSQL is running but no .env files found.");
    println!("[catcom] Enter connection details (press Enter to accept defaults):");

    let user = prompt_field("  User", &defaults.user);
    let password = prompt_field("  Password", &defaults.password);
    let host = prompt_field("  Host", &defaults.host);
    let port = prompt_field("  Port", &defaults.port);
    let dbname = prompt_field("  Database", &defaults.dbname);

    PgConfig { host, port, user, password, dbname }
}

fn prompt_field(label: &str, default: &str) -> String {
    print!("{label} [{default}]: ");
    io::stdout().flush().unwrap();

    let mut line = String::new();
    io::stdin().lock().read_line(&mut line).unwrap_or_else(|e| {
        eprintln!("Error: failed to read from stdin: {e}");
        exit(1);
    });

    let value = line.trim();
    if value.is_empty() {
        default.to_string()
    } else {
        value.to_string()
    }
}

fn pgdata_dir() -> PathBuf {
    let data_dir = env::var("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|_| {
        let home = env::var("HOME").expect("HOME environment variable is not set");
        PathBuf::from(home).join(".local").join("share")
    });
    data_dir.join("catcolab").join("pgdata")
}

pub(crate) fn pg_is_ready_at(host: &str, port: &str) -> bool {
    Command::new("pg_isready")
        .args(["-h", host, "-p", port])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn pg_is_ready(pg: &PgConfig) -> bool {
    pg_is_ready_at(&pg.host, &pg.port)
}

pub(crate) fn ensure_postgres_running(pg: &PgConfig) {
    if pg_is_ready(pg) {
        println!("[catcom] PostgreSQL is already running.");
        return;
    }

    let pgdata = pgdata_dir();
    println!("[catcom] PostgreSQL is not running. Using data directory: {}", pgdata.display());

    if !pgdata.join("PG_VERSION").exists() {
        println!("[catcom] Initializing PostgreSQL data directory...");
        fs::create_dir_all(&pgdata).unwrap_or_else(|e| {
            eprintln!("Error: failed to create pgdata directory: {e}");
            exit(1);
        });

        let mut cmd = Command::new("initdb");
        cmd.args(["-D", &pgdata.to_string_lossy(), "--no-locale", "-E", "UTF8", "--auth=trust"]);
        let status = status_or_exit(cmd, "failed to run initdb");
        ensure_success_or_exit(status, "initdb failed.");
    }

    let logfile = pgdata.join("logfile");
    println!("[catcom] Starting PostgreSQL...");

    let mut cmd = Command::new("pg_ctl");
    cmd.args([
        "-D",
        &pgdata.to_string_lossy(),
        "-l",
        &logfile.to_string_lossy(),
        "-o",
        &format!("-h {} -p {} -k {}", pg.host, pg.port, pgdata.display()),
        "start",
    ]);
    let status = status_or_exit(cmd, "failed to run pg_ctl");

    ensure_success_or_exit_with(status, || {
        eprintln!("Error: pg_ctl start failed. Check logs at: {}", logfile.display());
    });

    print!("[catcom] Waiting for PostgreSQL to start");
    for _ in 0..50 {
        if pg_is_ready(pg) {
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

pub(crate) fn ensure_database_and_user(pg: &PgConfig) {
    println!("[catcom] Ensuring database user and database exist...");

    let create_user_sql = format!(
        "DO $$ BEGIN \
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '{}') THEN \
                CREATE ROLE {} WITH LOGIN PASSWORD '{}'; \
            END IF; \
        END $$;",
        pg.user, pg.user, pg.password
    );

    if !try_run_psql(pg, "postgres", &create_user_sql) {
        eprintln!(
            "[catcom] Warning: could not ensure role '{}' exists (this is fine if it already does).",
            pg.user
        );
    }

    let check_sql = format!("SELECT 1 FROM pg_database WHERE datname = '{}'", pg.dbname);
    let mut cmd = Command::new("psql");
    cmd.args([
        "-h", &pg.host, "-p", &pg.port, "-U", &pg.user, "-d", "postgres", "-tAc", &check_sql,
    ])
    .env("PGPASSWORD", &pg.password);
    let check = output_or_exit(cmd, "failed to check for database");

    let exists = String::from_utf8_lossy(&check.stdout).trim().contains('1');

    if !exists {
        println!("[catcom] Creating database '{}'...", pg.dbname);
        let mut cmd = Command::new("createdb");
        cmd.args(["-h", &pg.host, "-p", &pg.port, "-U", &pg.user, "-O", &pg.user, &pg.dbname])
            .env("PGPASSWORD", &pg.password);
        let status = status_or_exit(cmd, "failed to run createdb");
        ensure_success_or_exit(status, "createdb failed.");
    }

    let grant_sql = format!("GRANT ALL ON SCHEMA public TO {};", pg.user);
    if !try_run_psql(pg, &pg.dbname, &grant_sql) {
        eprintln!(
            "[catcom] Warning: could not grant schema permissions (this is fine if already granted)."
        );
    }

    println!("[catcom] Database ready.");
}

fn try_run_psql(pg: &PgConfig, database: &str, sql: &str) -> bool {
    let mut cmd = Command::new("psql");
    cmd.args(["-h", &pg.host, "-p", &pg.port, "-U", &pg.user, "-d", database, "-c", sql])
        .env("PGPASSWORD", &pg.password)
        .stdout(Stdio::null());
    let status = status_or_exit(cmd, "failed to run psql");

    status.success()
}
