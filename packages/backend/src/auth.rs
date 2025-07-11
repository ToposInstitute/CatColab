use std::collections::HashMap;

use firebase_auth::{FirebaseAuth, FirebaseUser};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::app::{AppCtx, AppError, AppState};
use super::user::UserSummary;

/// Levels of permission that a user can have on a document.
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize, sqlx::Type, TS,
)]
#[sqlx(type_name = "permission_level", rename_all = "lowercase")]
pub enum PermissionLevel {
    Read,
    Write,
    Maintain,
    Own,
}

/// Permissions of a user on a document.
#[derive(Clone, Debug, Serialize, TS)]
pub struct UserPermissions {
    pub user: UserSummary,
    pub level: PermissionLevel,
}

/// Permissions set on a document.
#[derive(Clone, Debug, Serialize, TS)]
pub struct Permissions {
    /// Base permission level for any person, logged in or not.
    pub anyone: Option<PermissionLevel>,

    /// Permission level for the current user.
    pub user: Option<PermissionLevel>,

    /** Permission levels for all other users.

    Only owners of the document have access to this information.
     */
    pub users: Option<Vec<UserPermissions>>,
}

impl Permissions {
    /// Gets the highest level of permissions allowed.
    pub fn max_level(&self) -> Option<PermissionLevel> {
        self.anyone.into_iter().chain(self.user).reduce(std::cmp::max)
    }
}

/// Returns an error if the user_id in the session does not exist in the DB, returns None otherwise
///
/// Used by the client to gracefully handle stale sessions
pub async fn validate_session(ctx: AppCtx) -> Result<(), AppError> {
    let user_id = match ctx.user.as_ref().map(|u| u.user_id.clone()) {
        Some(id) => id,
        None => {
            return Ok(());
        }
    };

    let exists = sqlx::query_scalar!(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM users WHERE id = $1
        )
        "#,
        user_id
    )
    .fetch_one(&ctx.state.db)
    .await?;

    if !exists.unwrap_or(false) {
        return Err(AppError::Unauthorized);
    }

    Ok(())
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

/** Is the user authorized to access a ref at a given permission level?

The result is an error if the ref does not exist.
 */
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

/// Gets the highest level of permissions allowed for a ref.
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

    // Return 404 if the ref does not exist at all.
    if level.is_none() {
        ref_exists(ctx, ref_id).await?;
    }

    Ok(level)
}

/// Gets the permissions allowed for a ref.
pub async fn permissions(ctx: &AppCtx, ref_id: Uuid) -> Result<Permissions, AppError> {
    let query = sqlx::query!(
        r#"
        SELECT subject as "user_id", username, display_name,
               level as "level: PermissionLevel"
        FROM permissions
        LEFT OUTER JOIN users ON id = subject
        WHERE object = $1
        "#,
        ref_id
    );
    let mut entries = query.fetch_all(&ctx.state.db).await?;

    // Return 404 if the ref does not exist at all.
    if entries.is_empty() {
        ref_exists(ctx, ref_id).await?;
    }

    let mut anyone = None;
    if let Some(i) = entries.iter().position(|entry| entry.user_id.is_none()) {
        anyone = Some(entries.swap_remove(i).level);
    }

    let user_id = ctx.user.as_ref().map(|user| user.user_id.clone());
    let mut user = None;
    if let Some(i) = entries.iter().position(|entry| entry.user_id == user_id) {
        user = Some(entries.swap_remove(i).level);
    }

    let mut users = None;
    if user == Some(PermissionLevel::Own) {
        users = Some(
            entries
                .into_iter()
                .filter_map(|entry| {
                    if let Some(user_id) = entry.user_id {
                        Some(UserPermissions {
                            user: UserSummary {
                                id: user_id,
                                username: entry.username,
                                display_name: entry.display_name,
                            },
                            level: entry.level,
                        })
                    } else {
                        None
                    }
                })
                .collect(),
        );
    }

    Ok(Permissions {
        anyone,
        user,
        users,
    })
}

/// A new set of permissions to assign to a document.
#[derive(Debug, Deserialize, TS)]
pub struct NewPermissions {
    /// Base permission level for any person, logged in or not.
    pub anyone: Option<PermissionLevel>,

    /** Permission levels for users.

    A mapping from user IDs to permission levels.
    */
    pub users: HashMap<String, PermissionLevel>,
}

/** Replaces the set of permissions for a ref.

Note that this function does not update/diff the permissions, it replaces them
entirely. An exception is ownership which can never be revoked once granted.
*/
pub async fn set_permissions(
    state: &AppState,
    ref_id: Uuid,
    new: NewPermissions,
) -> Result<(), AppError> {
    let mut levels: Vec<_> = new.users.values().cloned().collect();
    let mut subjects: Vec<_> = new.users.into_keys().map(Some).collect();
    if let Some(anyone) = new.anyone {
        subjects.push(None);
        levels.push(anyone);
    }
    let objects: Vec<_> = std::iter::repeat_n(ref_id, subjects.len()).collect();

    // Because the first query deletes all permission entries for the ref
    // *except* ownership, the second query will fail, and thus the whole
    // transaction will fail and be rolled back, if the uniqueness constraint is
    // violated by attempting to downgrade an ownership permission.
    let mut transaction = state.db.begin().await?;

    let delete_query = sqlx::query!(
        "
        DELETE FROM permissions WHERE object = $1 AND level < 'own'
        ",
        ref_id,
    );
    delete_query.execute(&mut *transaction).await?;

    let insert_query = sqlx::query!(
        "
        INSERT INTO permissions(subject, object, level)
        SELECT * FROM UNNEST($1::text[], $2::uuid[], $3::permission_level[])
        ",
        &subjects as &[Option<String>],
        &objects,
        &levels as &[PermissionLevel],
    );
    insert_query.execute(&mut *transaction).await?;

    transaction.commit().await?;
    Ok(())
}

/// Verify that the given ref exists.
async fn ref_exists(ctx: &AppCtx, ref_id: Uuid) -> Result<(), AppError> {
    let query = sqlx::query_scalar!("SELECT 1 FROM refs WHERE id = $1", ref_id);
    query.fetch_one(&ctx.state.db).await?;
    Ok(())
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
