use firebase_auth::FirebaseUser;
use http::StatusCode;
use qubit::{handler, Extensions, FromRequestExtensions, Router, RpcError};
use serde::Serialize;
use serde_json::Value;
use tracing::debug;
use ts_rs::TS;
use uuid::Uuid;

use super::app::{AppCtx, AppError, AppState};
use super::auth::{authorize, PermissionLevel};
use super::{document as doc, user};

/// Create router for RPC API.
pub fn router() -> Router<AppState> {
    Router::new()
        .handler(new_ref)
        .handler(head_snapshot)
        .handler(save_snapshot)
        .handler(doc_id)
        .handler(sign_up_or_sign_in)
}

#[handler(mutation)]
async fn new_ref(ctx: AppCtx, content: Value) -> RpcResult<Uuid> {
    doc::new_ref(ctx, content).await.into()
}

#[handler(query)]
async fn head_snapshot(ctx: AppCtx, ref_id: Uuid) -> RpcResult<Value> {
    _head_snapshot(ctx, ref_id).await.into()
}
async fn _head_snapshot(ctx: AppCtx, ref_id: Uuid) -> Result<Value, AppError> {
    authorize(&ctx, ref_id, PermissionLevel::Read).await?;
    doc::head_snapshot(ctx.state, ref_id).await
}

#[handler(mutation)]
async fn save_snapshot(ctx: AppCtx, data: doc::RefContent) -> RpcResult<()> {
    _save_snapshot(ctx, data).await.into()
}
async fn _save_snapshot(ctx: AppCtx, data: doc::RefContent) -> Result<(), AppError> {
    authorize(&ctx, data.ref_id, PermissionLevel::Write).await?;
    doc::save_snapshot(ctx.state, data).await
}

#[handler(query)]
async fn doc_id(ctx: AppCtx, ref_id: Uuid) -> RpcResult<String> {
    _doc_id(ctx, ref_id).await.into()
}
async fn _doc_id(ctx: AppCtx, ref_id: Uuid) -> Result<String, AppError> {
    // Require write permissions since any changes made through Automerge will
    // be autosaved to the database.
    authorize(&ctx, ref_id, PermissionLevel::Write).await?;
    doc::doc_id(ctx.state, ref_id).await
}

#[handler(mutation)]
async fn sign_up_or_sign_in(ctx: AppCtx) -> RpcResult<()> {
    user::sign_up_or_sign_in(ctx).await.into()
}

/// Result returned by an RPC handler.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "tag")]
enum RpcResult<T> {
    Ok { content: T },
    Err { code: u16, message: String },
}

impl<T> From<AppError> for RpcResult<T> {
    fn from(error: AppError) -> Self {
        let code = match error {
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,
            AppError::Db(sqlx::Error::RowNotFound) => StatusCode::NOT_FOUND,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        RpcResult::Err {
            code: code.as_u16(),
            message: error.to_string(),
        }
    }
}

impl<T> From<Result<T, AppError>> for RpcResult<T> {
    fn from(result: Result<T, AppError>) -> Self {
        match result {
            Ok(content) => RpcResult::Ok { content },
            Err(error) => error.into(),
        }
    }
}

/// Extract user from request extension, if present.
impl FromRequestExtensions<AppState> for AppCtx {
    async fn from_request_extensions(
        state: AppState,
        mut extensions: Extensions,
    ) -> Result<Self, RpcError> {
        let user: Option<FirebaseUser> = extensions.remove();
        if let Some(some_user) = &user {
            debug!("Handling request from user: {}", some_user.user_id);
        }
        Ok(AppCtx { state, user })
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    #[test]
    fn rspc_type_defs() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pkg").join("src");
        super::router().write_bindings_to_dir(dir);
    }
}
