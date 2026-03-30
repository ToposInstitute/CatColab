//! The CatColab backend library.

/// Top-level application state and error types.
pub mod app;

/// Authentication and authorization for document refs.
pub mod auth;

/// Autosave listener for document changes.
pub mod autosave;

/// Autosurgeon utilities for datetime serialization.
pub mod autosurgeon_datetime;

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

/// User-state update helpers called from RPC handlers.
pub mod user_state_updates;
