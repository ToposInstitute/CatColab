use firebase_auth::{FirebaseAuth, FirebaseUser};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::app::{AppCtx, AppError};

/// Levels of permission that a user can have on a document.
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize, sqlx::Type,
)]
#[sqlx(type_name = "permission_level", rename_all = "lowercase")]
pub enum PermissionLevel {
    Read,
    Write,
    Maintain,
    Own,
}

/** Verify that user is authorized to access a ref at a given permission level.

It is safe to proceed if the result is `Ok`; otherwise, the requested action
should be aborted.
 */
pub async fn authorize(ctx: &AppCtx, ref_id: Uuid, level: PermissionLevel) -> Result<(), AppError> {
    let authorized = is_authorized(ctx, ref_id, level).await?;
    if authorized {
        Ok(())
    } else {
        Err(AppError::Forbidden(ref_id))
    }
}

/// Is the user authorized to access a ref at a given permission level?
pub async fn is_authorized(
    ctx: &AppCtx,
    ref_id: Uuid,
    level: PermissionLevel,
) -> Result<bool, AppError> {
    match max_permission_level(ctx, ref_id).await? {
        Some(max_level) => Ok(level <= max_level),
        None => Ok(false),
    }
}

/** Gets the highest level of permissions allowed for a ref.

The result is an error if the ref does not exist.
 */
pub async fn max_permission_level(
    ctx: &AppCtx,
    ref_id: Uuid,
) -> Result<Option<PermissionLevel>, AppError> {
    let query = sqlx::query_scalar!(
        r#"
        SELECT MAX(level) AS "max: PermissionLevel" FROM permissions
        WHERE object = $1 AND (subject IS NULL OR subject = $2)
        "#,
        ref_id,
        ctx.user.as_ref().map(|user| user.user_id.clone())
    );
    let level = query.fetch_one(&ctx.state.db).await?;

    // Yield a NOT_FOUND error if the ref doesn't exist at all.
    if level.is_none() {
        let query = sqlx::query_scalar!("SELECT 1 FROM refs WHERE id = $1", ref_id);
        query.fetch_one(&ctx.state.db).await?;
    }

    Ok(level)
}

/** Extracts an authenticated user from an HTTP request.

Note that the `firebase_auth` crate has an Axum feature with similar
functionality, but we don't use it because it doesn't integrate well with the
RPC service.
 */
pub fn authenticate_from_request<T>(
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
