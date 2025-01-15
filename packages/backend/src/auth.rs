use std::collections::HashMap;

use firebase_auth::{FirebaseAuth, FirebaseUser};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::app::{AppCtx, AppError};

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

/// Permissions set on a document.
#[derive(Clone, Debug, Default, Deserialize, Serialize, TS)]
pub struct Permissions {
    /// Base permission level for any person, logged in or not.
    #[ts(optional)]
    pub anyone: Option<PermissionLevel>,

    /// Permission level for the current user.
    #[ts(optional)]
    pub user: Option<PermissionLevel>,

    /** Permission levels for all other users.

    Only owners of the document have access to this information.
     */
    #[ts(optional)]
    pub users: Option<HashMap<String, PermissionLevel>>,
}

impl Permissions {
    /// Constructs from a list of permission entries.
    fn from_entries(mut entries: Vec<PermissionEntry>, user_id: Option<String>) -> Self {
        let mut anyone = None;
        if let Some(i) = entries.iter().position(|entry| entry.user.is_none()) {
            anyone = Some(entries.swap_remove(i).level);
        }

        let mut user = None;
        if let Some(i) = entries.iter().position(|entry| entry.user == user_id) {
            user = Some(entries.swap_remove(i).level);
        }

        let mut users = None;
        if user == Some(PermissionLevel::Own) {
            users = Some(
                entries
                    .into_iter()
                    .filter_map(|entry| entry.user.map(|id| (id, entry.level)))
                    .collect(),
            );
        }

        Self {
            anyone,
            user,
            users,
        }
    }

    /// Converts into a list of permission entries.
    fn to_entries(self, user_id: Option<String>) -> Vec<PermissionEntry> {
        let mut entries = Vec::new();
        if let Some(users) = self.users {
            entries = users
                .into_iter()
                .map(|(user, level)| PermissionEntry::new(Some(user), level))
                .collect();
        }
        if let Some(level) = self.anyone {
            entries.push(PermissionEntry::new(None, level));
        }
        if let Some(level) = self.user {
            entries.push(PermissionEntry::new(user_id, level));
        }
        entries
    }

    /// Gets the highest level of permissions allowed.
    pub fn max_level(&self) -> Option<PermissionLevel> {
        self.anyone.clone().into_iter().chain(self.user.clone()).reduce(std::cmp::max)
    }
}

/// Permission entry for a document.
struct PermissionEntry {
    user: Option<String>,
    level: PermissionLevel,
}

impl PermissionEntry {
    fn new(user: Option<String>, level: PermissionLevel) -> Self {
        Self { user, level }
    }
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
    let query = sqlx::query_as!(
        PermissionEntry,
        r#"
        SELECT subject as "user", level as "level: PermissionLevel"
        FROM permissions WHERE object = $1
        "#,
        ref_id
    );
    let entries = query.fetch_all(&ctx.state.db).await?;

    // Return 404 if the ref does not exist at all.
    if entries.is_empty() {
        ref_exists(ctx, ref_id).await?;
    }

    let user_id = ctx.user.as_ref().map(|user| user.user_id.clone());
    Ok(Permissions::from_entries(entries, user_id))
}

/// Sets or updates permissions for a ref.
pub async fn set_permissions(
    ctx: &AppCtx,
    ref_id: Uuid,
    permissions: Permissions,
) -> Result<(), AppError> {
    let user_id = ctx.user.as_ref().map(|user| user.user_id.clone());
    let entries = permissions.to_entries(user_id);
    let objects: Vec<_> = entries.iter().map(|_| ref_id).collect();
    let levels: Vec<_> = entries.iter().map(|entry| entry.level).collect();
    let subjects: Vec<_> = entries.into_iter().map(|entry| entry.user).collect();

    let mut transaction = ctx.state.db.begin().await?;

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
