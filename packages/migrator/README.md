# CatColab migrator

This directory contains the tool for managing migraitions of the CatColab database, written in Rust using
the framework [sqlx_migrator](https://github.com/iamsauravsharma/sqlx_migrator).

## Usage
The migrator tool can be run from this directory using `cargo run` or from anywhere else in the
repo using `cargo run -p migrator`. The migrator tool uses the default CLI interface provided by
`sqlx_migrator`, which is very similar to the `sqlx` CLI.

The `DATABASE_URL` environment variable must be set for the target database. This is typically configured
automatically by the Nix dev shell defined in the repository's `flake.nix`.

To view available commands, run

```sh
cargo run -p migrator help
```

To apply allmigrations, run

```sh
cargo run -p migrator apply
```

## Writing new migrations
For migrations that consist solely of SQL statements, the easiest way to get started is to copy the first
migration file: `src/migrations/m20241004010448_document_refs.rs` and modify it as needed.

Be sure to register your new migration in `src/migrations/mod.rs`.

To generate a timestamp for the migration filename, run:

```sh
date -u +"%Y%m%d%H%M%S"
```
