//! The CatColab backend library.

/// Top-level application state and error types.
pub mod app;

/// Authentication and authorization for document refs.
pub mod auth;

/// Conversion between Automerge documents and JSON.
pub mod automerge_json;

/// Procedures to create and manipulate documents.
pub mod document;

/// RPC service for the backend.
pub mod rpc;

/// Storage backend for Automerge documents.
pub mod storage;

/// User accounts and profiles.
pub mod user;

/// User state synchronized via Automerge.
pub mod user_state;

/// Subscriptions to user state changes.
pub mod user_state_subscription;
