use firebase_auth::FirebaseUser;
use http::StatusCode;
use qubit::{handler, Extensions, FromRequestExtensions, Router, RpcError};
use serde::Serialize;
use serde_json::Value;
use tracing::debug;
use ts_rs::TS;
use uuid::Uuid;

use super::app::{AppCtx, AppError, AppState};
use super::auth::{PermissionLevel, Permissions};
use super::{auth, document as doc, user};

/// Create router for RPC API.
pub fn router() -> Router<AppState> {
    Router::new()
        .handler(new_ref)
        .handler(get_doc)
        .handler(head_snapshot)
        .handler(save_snapshot)
        .handler(sign_up_or_sign_in)
        .handler(username_status)
        .handler(get_active_user_profile)
        .handler(set_active_user_profile)
}

#[handler(mutation)]
async fn new_ref(ctx: AppCtx, input: doc::NewRef) -> RpcResult<Uuid> {
    doc::new_ref(ctx, input).await.into()
}

#[handler(query)]
async fn get_doc(ctx: AppCtx, ref_id: Uuid) -> RpcResult<RefDoc> {
    _get_doc(ctx, ref_id).await.into()
}

async fn _get_doc(ctx: AppCtx, ref_id: Uuid) -> Result<RefDoc, AppError> {
    let permissions = auth::permissions(&ctx, ref_id).await?;
    let max_level = permissions.clone().max_level();
    if max_level >= Some(PermissionLevel::Write) {
        let doc_id = doc::doc_id(ctx.state, ref_id).await?;
        Ok(RefDoc::Live {
            doc_id,
            permissions,
        })
    } else if max_level >= Some(PermissionLevel::Read) {
        let content = doc::head_snapshot(ctx.state, ref_id).await?;
        Ok(RefDoc::Readonly {
            content,
            permissions,
        })
    } else {
        Err(AppError::Forbidden(ref_id))
    }
}

/// Document identified by a ref.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(tag = "tag")]
enum RefDoc {
    /// Readonly document, containing content at current head.
    Readonly {
        content: Value,
        permissions: Permissions,
    },
    /// Live document, containing an Automerge document ID.
    Live {
        #[serde(rename = "docId")]
        doc_id: String,
        permissions: Permissions,
    },
}

#[handler(query)]
async fn head_snapshot(ctx: AppCtx, ref_id: Uuid) -> RpcResult<Value> {
    _head_snapshot(ctx, ref_id).await.into()
}
async fn _head_snapshot(ctx: AppCtx, ref_id: Uuid) -> Result<Value, AppError> {
    auth::authorize(&ctx, ref_id, PermissionLevel::Read).await?;
    doc::head_snapshot(ctx.state, ref_id).await
}

#[handler(mutation)]
async fn save_snapshot(ctx: AppCtx, data: doc::RefContent) -> RpcResult<()> {
    _save_snapshot(ctx, data).await.into()
}
async fn _save_snapshot(ctx: AppCtx, data: doc::RefContent) -> Result<(), AppError> {
    auth::authorize(&ctx, data.ref_id, PermissionLevel::Write).await?;
    doc::save_snapshot(ctx.state, data).await
}

#[handler(mutation)]
async fn sign_up_or_sign_in(ctx: AppCtx) -> RpcResult<()> {
    user::sign_up_or_sign_in(ctx).await.into()
}

#[handler(query)]
async fn username_status(ctx: AppCtx, username: &str) -> RpcResult<user::UsernameStatus> {
    user::username_status(ctx.state, username).await.into()
}

#[handler(query)]
async fn get_active_user_profile(ctx: AppCtx) -> RpcResult<user::UserProfile> {
    user::get_active_user_profile(ctx).await.into()
}

#[handler(mutation)]
async fn set_active_user_profile(ctx: AppCtx, user: user::UserProfile) -> RpcResult<()> {
    user::set_active_user_profile(ctx, user).await.into()
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
            AppError::Invalid(_) => StatusCode::BAD_REQUEST,
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
