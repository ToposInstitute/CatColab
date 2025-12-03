# CatColab backend

This directory contains the web server for the CatColab application, written in
Rust using the [`sqlx`](https://github.com/launchbadge/sqlx) bindings for
PostgreSQL and the [`axum`](https://github.com/tokio-rs/axum) web framework.

You can find the auto-generated documentation for this Rust crate at [next.catcolab.org/dev/rust/backend/](https://next.catcolab.org/dev/rust/backend/).

## Setup

1. Install Rust, say by using [rustup](https://rustup.rs/)

2. Make sure the required packages are built and installed:

   ```sh
   cd packages/notebook-types
   pnpm run build:node
   cd ../automerge-doc-server
   pnpm install
   ```

3. Set up PostgreSQL (choose one of the options below)

   - **Option A: Using Docker (Recommended)**

     Run PostgreSQL in a Docker container:

     ```sh
     docker run --name catcolab-postgres -e POSTGRES_PASSWORD=password \
         -p 5432:5432 -d postgres:15
     ```

     This creates a PostgreSQL instance with superuser `postgres` and password `password`. The `catcolab` database and user will be created automatically by the setup script in step 6.

     The default `.env.development` file is pre-configured to work with this Docker setup.

   - **Option B: Using local PostgreSQL installation**

     Install and run PostgreSQL locally. Ensure you have superuser access (typically the `postgres` user).

     **Note:** The default `.env.development` assumes the PostgreSQL superuser is `postgres` with password `password`.
     If your local PostgreSQL has different superuser credentials, you'll need to update `DATABASE_SUPERUSER_URL`
     in your `.env` file (see next step).

4. Change to the backend directory: `cd packages/backend`
5. Copy the `.env.development` file: `cp .env.development .env`
   - If you're using the Docker command above as-is, the defaults will work perfectly
   - If you're using local PostgreSQL with different superuser credentials, you can either:
     - Update `DATABASE_SUPERUSER_URL` in `.env` to match your postgres superuser credentials, OR
     - Remove `DATABASE_SUPERUSER_URL` from `.env` and you'll be prompted for your postgres password when running the setup
   - **If NOT using Nix shell:** Also copy the `.env` file to the migrator directory: `cp .env ../migrator/.env`
   - **If using Nix shell:** The environment is automatically configured and you don't need to copy `.env` files manually
6. Run the database setup:
   - If using Nix shell: `cc-utils db setup` (the script is in your PATH)
   - Otherwise: `../../infrastructure/scripts/cc-utils db setup`
   - This command connects as the PostgreSQL superuser and automatically creates:
     - The `catcolab` database user with appropriate permissions
     - The `catcolab` database owned by that user
   - It then runs all database migrations
7. Build the backend binary: `cargo build`
8. Run the unit tests: `cargo test`

## Usage

The CatColab backend consists of two services:

1. the main web server (this package)
2. the [Automerge document server](../automerge-doc-server).

To run
the backend locally, launch the two services by running the following commands
in separate terminals, in any order:

```sh
cd packages/backend
cargo run
```

```sh
cd packages/automerge-doc-server
pnpm run main
```

The backend is now running locally.

To run the integration tests for the RPC API:

```sh
cd packages/frontend
pnpm run test
```

To launch the frontend using the local backend:

```
cd packages/frontend
pnpm run dev
```

## Running migrations

Migrations are in the `migrator` package which uses the
[sqlx_migrator](https://github.com/iamsauravsharma/sqlx_migrator) framework.

The migrator tool can be run from any directory using the `cargo run -p backend migrator ...` command.
The migrator tool uses the default CLI interface provided by `sqlx_migrator`, which is very similar to
the `sqlx` CLI.

The `DATABASE_URL` environment variable must be set for the target database. This is typically configured
automatically by the Nix dev shell defined in the repository's `flake.nix`. Alternatively it is read from
the `.env` file in the current directory.

To view available commands, run

```sh
cargo run -p migrator help
```

To apply all migrations, run

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

Don't forget to run `cargo sqlx prepare` in `packages/backend` after making schema changes!

