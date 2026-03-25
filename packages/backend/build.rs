//! Build script that embeds the git hash into the binary at compile time.
//! The build script's cached output is invalidated when the `GIT_HASH` env var changes.

fn main() {
    let hash = std::env::var("GIT_HASH").unwrap_or_else(|_| "dev".to_string());
    println!("cargo:rustc-env=GIT_HASH={hash}");
    println!("cargo:rerun-if-env-changed=GIT_HASH");
}
