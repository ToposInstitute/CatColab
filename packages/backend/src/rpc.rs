use http::StatusCode;
use qubit::{handler, Router};
use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;
use uuid::Uuid;

use super::app::{AppError, AppState};
use super::document as doc;

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

#[handler(mutation)]
async fn new_ref(state: AppState, content: Value) -> RpcResult<Uuid> {
    doc::new_ref(state, content).await.into()
}

#[handler(query)]
async fn head_snapshot(state: AppState, ref_id: Uuid) -> RpcResult<Value> {
    doc::head_snapshot(state, ref_id).await.into()
}

#[handler(mutation)]
async fn save_snapshot(state: AppState, data: doc::RefContent) -> RpcResult<()> {
    doc::save_snapshot(state, data).await.into()
}

#[handler(query)]
async fn doc_id(state: AppState, ref_id: Uuid) -> RpcResult<String> {
    doc::doc_id(state, ref_id).await.into()
}

pub fn router() -> Router<AppState> {
    Router::new()
        .handler(new_ref)
        .handler(head_snapshot)
        .handler(save_snapshot)
        .handler(doc_id)
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
