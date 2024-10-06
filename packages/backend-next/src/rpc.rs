use rspc::{Error, ErrorCode, Router};
use serde_json::Value;
use uuid::Uuid;

use super::app::{AppError, AppState};
use super::document as doc;

impl From<AppError> for Error {
    fn from(error: AppError) -> Self {
        let message = error.to_string();
        Error::with_cause(ErrorCode::InternalServerError, message, error)
    }
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .mutation("new_ref", |t| t(|state, content: Value| async move {
            Ok(doc::new_ref(state, content).await?)
        }))
        .query("head_snapshot", |t| t(|state, ref_id: Uuid| async move {
            Ok(doc::head_snapshot(state, ref_id).await?)
        }))
        .mutation("save_snapshot", |t| t(|state, data: doc::RefContent| async move {
            Ok(doc::save_snapshot(state, data).await?)
        }))
        .query("doc_id", |t| t(|state, ref_id: Uuid| async move {
            Ok(doc::doc_id(state, ref_id).await?)
        }))
        .build()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    #[test]
    fn rspc_type_defs() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pkg").join("types.ts");
        super::router().export_ts(path).unwrap();
    }
}
