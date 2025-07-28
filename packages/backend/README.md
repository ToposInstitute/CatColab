# CatColab backend

This directory contains the web server for the CatColab application, written in
Rust using the [`sqlx`](https://github.com/launchbadge/sqlx) bindings for
PostgreSQL and the [`axum`](https://github.com/tokio-rs/axum) web framework.

## Setup

1. Install Rust, say by using [rustup](https://rustup.rs/)
2. Install PostgreSQL
3. Create a new database named `catcolab`
4. Change to this directory: `cd packages/backend`
5. Update the `DATABASE_URL` variable in the file `.env` as needed with your
   database username, password, and port
6. Run the database migrations: `cargo run -p migrator apply`
7. Build the backend binary: `cargo build`
8. Run the unit tests: `cargo test`

## Usage

The CatColab backend consists of two services, the main web server (this
package) and the [Automerge document server](../automerge-doc-server). To run
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
