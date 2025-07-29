/*! The CatColab web server for the backend.

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

The CatColab backend consists of two services: the main web server (this
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

## Updating Cargo dependencies

**tl;dr:** Run `crate2nix generate` in the repository root and commit the updated `Cargo.nix` file.

To speed up deployments, [crate2nix](https://nix-community.github.io/crate2nix/) is used to cache the
build artifacts of Rust dependencies. Without it, dependencies would be rebuilt from scratch on every
deployment, significantly increasing build times.

`crate2nix` solves this by generating a `Cargo.nix` file, which describes the full dependency graph of
the project in a reproducible, Nix-compatible format. This file allows Nix to more effectively cache and
reuse dependency builds across deployments.

Whenever you update your `Cargo.toml` or `Cargo.lock` you should regenerate `Cargo.nix` by running the
following commands in the repository root:

```bash
nix develop
crate2nix generate
```

And committing the the updated `Cargo.nix` file.

Don't forget to run `cargo sqlx prepare` in `packages/backend`!
*/

use axum::{Router, routing::get};
use firebase_auth::FirebaseAuth;
use socketioxide::SocketIo;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use tracing_subscriber::filter::{EnvFilter, LevelFilter};

mod app;
mod auth;
mod document;
mod rpc;
mod socket;
mod user;

/// Port for the web server providing the RPC API.
fn web_port() -> String {
    dotenvy::var("PORT").unwrap_or("8000".to_string())
}

/** Port for internal communication with the Automerge doc server.

This port should *not* be open to the public.
*/
fn automerge_io_port() -> String {
    dotenvy::var("AUTOMERGE_IO_PORT").unwrap_or("3000".to_string())
}

#[tokio::main]
async fn main() {
    let env_filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy();

    tracing_subscriber::fmt().with_env_filter(env_filter).init();

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&dotenvy::var("DATABASE_URL").expect("`DATABASE_URL` should be set"))
        .await
        .expect("Failed to connect to database");

    let (io_layer, io) = SocketIo::new_layer();

    let state = app::AppState {
        automerge_io: io,
        db,
    };

    // We need to wrap FirebaseAuth in an Arc because if it's ever dropped the process which updates it's
    // jwt keys will be killed. The library is using the anti pattern of implementing both Clone and Drop on the
    // same struct.
    // https://github.com/trchopan/firebase-auth/issues/30
    let firebase_auth =
        Arc::new(FirebaseAuth::new(&dotenvy::var("FIREBASE_PROJECT_ID").unwrap()).await);

    socket::setup_automerge_socket(state.clone());

    let main_task = tokio::task::spawn(async {
        let port = web_port();
        let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await.unwrap();

        let router = rpc::router();
        let (qubit_service, qubit_handle) = router.to_service(state);
        let qubit_service = ServiceBuilder::new()
            .map_request(move |mut req: hyper::Request<_>| {
                match auth::authenticate_from_request(&firebase_auth, &req) {
                    Ok(Some(user)) => {
                        req.extensions_mut().insert(user);
                    }
                    Ok(None) => {}
                    Err(err) => {
                        error!("Authentication error: {err}");
                    }
                };
                req
            })
            .service(qubit_service);

        let app = Router::new()
            .route("/", get(|| async { "Hello! The CatColab server is running" }))
            .nest_service("/rpc", qubit_service)
            .layer(CorsLayer::permissive());
        info!("Web server listening at port {port}");
        axum::serve(listener, app).await.unwrap();

        qubit_handle.stop().unwrap();
    });

    let automerge_io_task = tokio::task::spawn(async {
        let port = automerge_io_port();
        let listener = tokio::net::TcpListener::bind(format!("localhost:{port}")).await.unwrap();
        let app = Router::new().layer(io_layer);
        info!("Automerge socket listening at port {port}");
        axum::serve(listener, app).await.unwrap();
    });

    let (res_main, res_io) = tokio::join!(main_task, automerge_io_task);
    res_main.unwrap();
    res_io.unwrap();
}
