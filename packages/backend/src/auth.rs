use firebase_auth::{FirebaseAuth, FirebaseUser};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::app::{AppCtx, AppError};

/// Levels of permission that a user can have on a document.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize, sqlx::Type)]
#[sqlx(type_name = "permission_level", rename_all = "lowercase")]
pub enum PermissionLevel {
    Read,
    Write,
    Maintain,
    Own,
}

/// Attempts to authorize a user to access a ref at the given permission level.
pub async fn authorize(ctx: &AppCtx, ref_id: Uuid, level: PermissionLevel) -> Result<(), AppError> {
    let query = sqlx::query_scalar!(
        "SELECT EXISTS(
            SELECT 1 FROM permissions
            WHERE object = $1 AND (subject IS NULL OR subject = $2) AND level >= $3
        )",
        ref_id,
        ctx.user.as_ref().map(|user| user.user_id.clone()),
        level as _
    );
    let authorized = query.fetch_one(&ctx.state.db).await?;
    if authorized.unwrap_or(false) {
        Ok(())
    } else {
        Err(AppError::Unauthorized)
    }
}

/** Extracts an authenticated user from an HTTP request.

Note that the `firebase_auth` crate has an Axum feature with similar
functionality, but we don't use it because it doesn't integrate well with the
RPC service.
 */
pub fn authenticate_user<T>(
    firebase_auth: &FirebaseAuth,
    req: &hyper::Request<T>,
) -> Result<Option<FirebaseUser>, String> {
    let maybe_auth_header = req
        .headers()
        .get(http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    maybe_auth_header
        .map(|auth_header| {
            let bearer = auth_header
                .strip_prefix("Bearer ")
                .ok_or_else(|| "Missing Bearer token".to_string())?;

            firebase_auth
                .verify(bearer)
                .map_err(|err| format!("Failed to verify token: {}", err))
        })
        .transpose()
}
