use std::collections::HashMap;

use autosurgeon::{Hydrate, Reconcile, Text, reconcile};
use samod::DocumentId;
use serde::Deserialize;
use sqlx::PgPool;
use tracing::{debug, info};
use ts_rs::TS;

use crate::app::{AppError, AppState};
use crate::auth::PermissionLevel;

/// Autosurgeon serialization of `DateTime<Utc>` as milliseconds since Unix epoch.
mod datetime_millis {
    use autosurgeon::{HydrateError, ReadDoc, Reconcile, Reconciler};
    use chrono::{DateTime, TimeZone, Utc};

    pub fn reconcile<R: Reconciler>(dt: &DateTime<Utc>, reconciler: R) -> Result<(), R::Error> {
        dt.timestamp_millis().reconcile(reconciler)
    }

    pub fn hydrate<D: ReadDoc>(
        doc: &D,
        obj: &automerge::ObjId,
        prop: autosurgeon::Prop<'_>,
    ) -> Result<DateTime<Utc>, HydrateError> {
        let millis: i64 = autosurgeon::hydrate_prop(doc, obj, prop)?;
        Utc.timestamp_millis_opt(millis).single().ok_or_else(|| {
            HydrateError::unexpected("valid timestamp", "invalid timestamp millis".to_string())
        })
    }
}

/// Autosurgeon serialization of `Option<DateTime<Utc>>` as optional milliseconds since Unix epoch.
mod option_datetime_millis {
    use autosurgeon::{HydrateError, ReadDoc, Reconcile, Reconciler};
    use chrono::{DateTime, TimeZone, Utc};

    pub fn reconcile<R: Reconciler>(
        dt: &Option<DateTime<Utc>>,
        reconciler: R,
    ) -> Result<(), R::Error> {
        dt.map(|dt| dt.timestamp_millis()).reconcile(reconciler)
    }

    pub fn hydrate<D: ReadDoc>(
        doc: &D,
        obj: &automerge::ObjId,
        prop: autosurgeon::Prop<'_>,
    ) -> Result<Option<DateTime<Utc>>, HydrateError> {
        let millis: Option<i64> = autosurgeon::hydrate_prop(doc, obj, prop)?;
        match millis {
            Some(millis) => {
                let dt = Utc.timestamp_millis_opt(millis).single().ok_or_else(|| {
                    HydrateError::unexpected(
                        "valid timestamp",
                        "invalid timestamp millis".to_string(),
                    )
                })?;
                Ok(Some(dt))
            }
            None => Ok(None),
        }
    }
}

mod permission_level_text {
    use autosurgeon::reconcile::TextReconciler;
    use autosurgeon::{HydrateError, ReadDoc, Reconciler, Text};

    use crate::auth::PermissionLevel;

    pub fn reconcile<R: Reconciler>(
        level: &PermissionLevel,
        mut reconciler: R,
    ) -> Result<(), R::Error> {
        let value = match level {
            PermissionLevel::Read => "Read",
            PermissionLevel::Write => "Write",
            PermissionLevel::Maintain => "Maintain",
            PermissionLevel::Own => "Own",
        };
        let mut text = reconciler.text()?;
        text.update(value)
    }

    pub fn hydrate<D: ReadDoc>(
        doc: &D,
        obj: &automerge::ObjId,
        prop: autosurgeon::Prop<'_>,
    ) -> Result<PermissionLevel, HydrateError> {
        let value: Text = autosurgeon::hydrate_prop(doc, obj, prop)?;
        match value.as_str() {
            "Read" => Ok(PermissionLevel::Read),
            "Write" => Ok(PermissionLevel::Write),
            "Maintain" => Ok(PermissionLevel::Maintain),
            "Own" => Ok(PermissionLevel::Own),
            other => Err(HydrateError::unexpected(
                "\"Read\", \"Write\", \"Maintain\", or \"Own\"",
                other.to_string(),
            )),
        }
    }
}

/// User info for user state synchronization.
///
/// This is similar to [`crate::user::UserSummary`] but uses [`Text`] instead of [`String`]
/// for compatibility with Automerge/Autosurgeon serialization.
#[derive(Debug, Clone, Eq, PartialEq, Reconcile, Hydrate, TS)]
#[ts(rename_all = "camelCase", export_to = "user_state.ts")]
pub struct UserInfo {
    /// The user's chosen username, if set.
    #[ts(as = "Option<String>")]
    pub username: Option<Text>,
    /// The user's display name, if set.
    #[autosurgeon(rename = "displayName")]
    #[ts(as = "Option<String>")]
    pub display_name: Option<Text>,
}

/// A single permission entry for a document in user state.
///
/// Represents one user's (or the public "anyone") permission level on a document.
#[cfg_attr(feature = "property-tests", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Reconcile, Hydrate, TS)]
#[ts(rename_all = "camelCase", export_to = "user_state.ts")]
pub struct PermissionInfo {
    /// The user ID this permission applies to, or `None` for the public "anyone" permission.
    #[key]
    pub user: Option<String>,
    /// The permission level granted.
    #[autosurgeon(with = "permission_level_text")]
    pub level: crate::auth::PermissionLevel,
}

/// Document reference information for user state synchronization.
///
/// Contains lightweight metadata about a document that the user has access to.
#[cfg_attr(feature = "property-tests", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Reconcile, Hydrate, TS)]
#[ts(rename_all = "camelCase", export_to = "user_state.ts")]
pub struct DocInfo {
    /// The name of the document.
    #[ts(as = "String")]
    pub name: Text,
    /// The type of the document (e.g., "notebook", "theory").
    #[autosurgeon(rename = "typeName")]
    pub type_name: String,
    /// The theory of the document, if it is a model.
    pub theory: Option<String>,
    /// All permissions on this document (users and public).
    pub permissions: Vec<PermissionInfo>,
    /// When this document was created.
    #[autosurgeon(rename = "createdAt", with = "datetime_millis")]
    #[ts(type = "number")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// When this document was deleted, if applicable.
    #[autosurgeon(rename = "deletedAt", with = "option_datetime_millis")]
    #[ts(type = "number | null")]
    pub deleted_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The parent document ref ID, if this document has a parent.
    #[ts(type = "Uint8Array | null")]
    pub parent: Option<uuid::Uuid>,
    /// The ref IDs of child documents.
    #[ts(type = "Array<Uint8Array>")]
    pub children: Vec<uuid::Uuid>,
}

/// State associated with a user, synchronized via Automerge.
#[cfg_attr(feature = "property-tests", derive(PartialEq, Eq))]
#[derive(Debug, Clone, Reconcile, Hydrate, TS)]
#[cfg_attr(not(test), ts(export, export_to = "user_state.ts"))]
pub struct UserState {
    /// The user's own profile information.
    pub profile: UserInfo,
    /// All users referenced in document permissions, keyed by user ID.
    #[autosurgeon(rename = "knownUsers")]
    #[ts(rename = "knownUsers")]
    pub known_users: HashMap<String, UserInfo>,
    /// The document refs accessible to the user, keyed by ref UUID string.
    /// We cannot use the Uuid type here because Automerge requires the keys to have a `AsRef<str>` impl.
    pub documents: HashMap<String, DocInfo>,
}

impl UserState {
    /// Creates a new empty UserState for the given user.
    pub fn new(_user_id: &str) -> Self {
        Self {
            profile: UserInfo { username: None, display_name: None },
            known_users: HashMap::new(),
            documents: HashMap::new(),
        }
    }

    /// Recomputes the `children` field of every [`DocInfo`] from the `parent` fields.
    ///
    /// This should be called whenever the document map is mutated (initial load,
    /// upsert, or revoke) so that the children vecs stay consistent.
    pub fn recompute_children(&mut self) {
        // Clear all existing children vecs.
        for doc in self.documents.values_mut() {
            doc.children.clear();
        }

        // Collect (parent_key, child_uuid) pairs first to avoid borrow conflicts.
        let pairs: Vec<(String, uuid::Uuid)> = self
            .documents
            .iter()
            .filter_map(|(key, doc)| {
                let parent_id = doc.parent?;
                Some((parent_id.to_string(), uuid::Uuid::parse_str(key).ok()?))
            })
            .collect();

        for (parent_key, child_uuid) in pairs {
            if let Some(parent_doc) = self.documents.get_mut(&parent_key) {
                parent_doc.children.push(child_uuid);
            }
        }
    }
}

/// A permission entry as returned from the database JSON aggregation.
#[derive(Debug, Deserialize)]
pub struct DbPermission {
    /// The user ID, or `None` for the public "anyone" permission.
    pub user_id: Option<String>,
    /// The permission level as a string (e.g., "read", "write", "own").
    pub level: String,
}

impl DbPermission {
    /// Convert this database permission entry into a [`PermissionInfo`].
    pub fn to_permission_info(&self) -> Option<PermissionInfo> {
        let level = match self.level.as_str() {
            "read" => PermissionLevel::Read,
            "write" => PermissionLevel::Write,
            "maintain" => PermissionLevel::Maintain,
            "own" => PermissionLevel::Own,
            _ => return None,
        };
        let user = self.user_id.clone();
        Some(PermissionInfo { user, level })
    }
}

/// A user info entry as returned from database JSON aggregation.
#[derive(Debug, Deserialize)]
pub struct DbUserInfo {
    /// The user's chosen username, if set.
    pub username: Option<String>,
    /// The user's display name, if set.
    pub display_name: Option<String>,
}

impl DbUserInfo {
    /// Convert to a [`UserInfo`] for the user state.
    pub fn to_user_info(&self) -> UserInfo {
        UserInfo {
            username: self.username.clone().map(Text::from),
            display_name: self.display_name.clone().map(Text::from),
        }
    }
}

/// Reads user state from the database.
pub async fn read_user_state_from_db(user_id: String, db: &PgPool) -> Result<UserState, AppError> {
    debug!(user_id = %user_id, "Reading user state from database");

    let query_start = std::time::Instant::now();

    // Query documents the user has access to, excluding public documents.
    // Deleted refs are included with their deleted_at timestamp so the
    // frontend can filter them into a trash view.
    // All permissions for each document are returned as a JSON array.
    let results = sqlx::query!(
        r#"
        WITH
            filtered_ids AS (
                SELECT refs.id
                FROM refs
                WHERE
                    -- filter by minimum permission level (read)
                    get_max_permission($1, refs.id) >= 'read'::permission_level
                    -- exclude public-only documents (user must have explicit permission)
                    AND EXISTS (
                        SELECT 1
                        FROM permissions p_searcher
                        WHERE
                            p_searcher.object = refs.id
                            AND p_searcher.subject = $1
                    )
            )
        SELECT
            refs.id AS "ref_id!",
            snapshots.content->>'name' AS name,
            snapshots.content->>'type' AS type_name,
            snapshots.content->>'theory' AS theory,
            refs.created AS "created_at!",
            refs.deleted_at,
            (COALESCE(
                snapshots.content->'diagramIn'->>'_id',
                snapshots.content->'analysisOf'->>'_id'
            ))::uuid AS "parent: Option<uuid::Uuid>",
            COALESCE(
                (SELECT json_agg(json_build_object(
                    'user_id', p.subject,
                    'level', p.level::text
                ) ORDER BY p.level DESC)
                FROM permissions p
                WHERE p.object = refs.id
                ), '[]'::json
            ) AS "permissions!: sqlx::types::Json<Vec<DbPermission>>"
        FROM filtered_ids
        JOIN refs ON refs.id = filtered_ids.id
        JOIN snapshots ON snapshots.id = refs.head
        ORDER BY refs.created DESC;
        "#,
        user_id,
    )
    .fetch_all(db)
    .await?;

    let query_duration = query_start.elapsed();

    debug!(
        user_id = %user_id,
        document_count = results.len(),
        query_duration_ms = query_duration.as_millis(),
        "Successfully fetched user documents from database"
    );

    let documents: HashMap<String, DocInfo> = results
        .into_iter()
        .map(|row| {
            let key = row.ref_id.to_string();
            let permissions: Vec<PermissionInfo> =
                row.permissions.0.iter().filter_map(|p| p.to_permission_info()).collect();

            let info = DocInfo {
                name: Text::from(row.name.unwrap_or_else(|| "untitled".to_string())),
                type_name: row.type_name.expect("type_name should never be null"),
                theory: row.theory,
                permissions,
                created_at: row.created_at,
                deleted_at: row.deleted_at,
                parent: row.parent.flatten(),
                children: Vec::new(),
            };
            (key, info)
        })
        .collect();

    // Fetch user info for all users referenced in document permissions.
    let user_ids: Vec<String> = documents
        .values()
        .flat_map(|doc| doc.permissions.iter().filter_map(|p| p.user.clone()))
        .collect();

    let known_users: HashMap<String, UserInfo> = if user_ids.is_empty() {
        HashMap::new()
    } else {
        let user_rows = sqlx::query!(
            r#"
            SELECT id, username, display_name FROM users
            WHERE id = ANY($1)
            "#,
            &user_ids,
        )
        .fetch_all(db)
        .await?;

        user_rows
            .into_iter()
            .map(|row| {
                (
                    row.id,
                    UserInfo {
                        username: row.username.map(Text::from),
                        display_name: row.display_name.map(Text::from),
                    },
                )
            })
            .collect()
    };

    debug!(
        user_id = %user_id,
        document_count = documents.len(),
        "User state created successfully"
    );

    // Fetch the user's own profile info.
    let profile_row = sqlx::query!(
        r#"
        SELECT username, display_name FROM users
        WHERE id = $1
        "#,
        user_id,
    )
    .fetch_optional(db)
    .await?;

    let profile = match profile_row {
        Some(row) => UserInfo {
            username: row.username.map(Text::from),
            display_name: row.display_name.map(Text::from),
        },
        None => UserInfo { username: None, display_name: None },
    };

    let mut user_state = UserState { profile, known_users, documents };
    user_state.recompute_children();
    Ok(user_state)
}

/// Gets the user state document ID for a given user.
pub async fn get_user_state_doc(state: &AppState, user_id: &str) -> Option<DocumentId> {
    let states = state.user_states.read().await;
    states.get(user_id).cloned()
}

/// Gets or creates the user state document for a given user.
///
/// This function reads the user's current state from the database and either:
/// - Returns the existing document ID if already cached
/// - Creates a new document with the current DB state if not cached
pub async fn get_or_create_user_state_doc(
    state: &AppState,
    user_id: &str,
) -> Result<DocumentId, AppError> {
    debug!(user_id = %user_id, "Getting or creating user state document");

    // Check if we already have a document for this user
    if let Some(doc_id) = get_user_state_doc(state, user_id).await {
        debug!(
            user_id = %user_id,
            doc_id = %doc_id,
            "Found existing user state document"
        );
        return Ok(doc_id);
    }

    debug!(user_id = %user_id, "No existing document, creating new one");

    let user_state = read_user_state_from_db(user_id.to_string(), &state.db).await?;
    create_user_state_doc(state, user_id, &user_state).await
}

/// Converts a `UserState` into an Automerge document.
pub fn user_state_to_automerge(state: &UserState) -> Result<automerge::Automerge, AppError> {
    let mut doc = automerge::Automerge::new();
    doc.transact(|tx| reconcile(tx, state))
        .map_err(|e| AppError::UserStateSync(format!("Failed to reconcile: {:?}", e)))?;
    Ok(doc)
}

/// Creates a new user state document in samod and registers it in the user states map.
pub async fn create_user_state_doc(
    state: &AppState,
    user_id: &str,
    user_state: &UserState,
) -> Result<DocumentId, AppError> {
    debug!(
        user_id = %user_id,
        document_count = user_state.documents.len(),
        "Creating new user state document"
    );

    let default_state = UserState::new(user_id);
    let doc = user_state_to_automerge(&default_state)?;
    let doc_handle = state.repo.create(doc).await?;
    let doc_id = doc_handle.document_id().clone();

    debug!(user_id = %user_id, doc_id = %doc_id, "Empty document created in repo");

    doc_handle.with_document(|doc| {
        doc.transact(|tx| reconcile(tx, user_state))
            .map_err(|e| AppError::UserStateSync(format!("Failed to reconcile: {:?}", e)))
    })?;

    debug!(user_id = %user_id, doc_id = %doc_id, "Document populated with user state");

    let mut states = state.user_states.write().await;
    states.insert(user_id.to_string(), doc_id.clone());

    debug!(
        user_id = %user_id,
        doc_id = %doc_id,
        total_cached_users = states.len(),
        "Stored document ID in user states map"
    );

    info!(user_id = %user_id, doc_id = %doc_id, "Created user state document");

    Ok(doc_id)
}

/// Arbitrary instances for property-based testing.
#[cfg(feature = "property-tests")]
pub mod arbitrary {
    #![allow(dead_code)]
    use super::*;
    use crate::auth::PermissionLevel;
    use autosurgeon::Text;
    use chrono::{TimeZone, Utc};
    use proptest::{arbitrary::Arbitrary, prelude::*};
    use proptest_arbitrary_interop::arb;

    impl Arbitrary for UserInfo {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            (any::<Option<String>>(), any::<Option<String>>())
                .prop_map(|(username, display_name)| {
                    // Filter out empty strings: the DB has a unique constraint on
                    // username, and empty strings are not valid usernames/display
                    // names in practice.
                    let username = username.filter(|s| !s.is_empty());
                    let display_name = display_name.filter(|s| !s.is_empty());
                    UserInfo {
                        username: username.map(Text::from),
                        display_name: display_name.map(Text::from),
                    }
                })
                .boxed()
        }
    }

    impl Arbitrary for PermissionInfo {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            (
                proptest::option::of(arb::<uuid::Uuid>().prop_map(|u| format!("test_{u}"))),
                any::<PermissionLevel>(),
            )
                .prop_map(|(user, level)| PermissionInfo { user, level })
                .boxed()
        }
    }

    impl Arbitrary for DocInfo {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            (
                any::<String>(),
                any::<String>(),
                proptest::option::of(any::<String>()),
                prop::collection::vec(any::<PermissionInfo>(), 0..5),
                0i64..253402300799i64,
                proptest::option::of(0i64..253402300799i64),
                proptest::option::of(arb::<uuid::Uuid>()),
            )
                .prop_map(
                    |(name, type_name, theory, permissions, seconds, deleted_seconds, parent)| {
                        DocInfo {
                            name: Text::from(name),
                            type_name,
                            theory,
                            permissions,
                            created_at: Utc
                                .timestamp_opt(seconds, 0)
                                .single()
                                .expect("valid timestamp"),
                            deleted_at: deleted_seconds.map(|s| {
                                Utc.timestamp_opt(s, 0).single().expect("valid timestamp")
                            }),
                            parent,
                            // Children are computed, not generated independently.
                            children: Vec::new(),
                        }
                    },
                )
                .boxed()
        }
    }

    /// Generates a consistent user state doc info entry (key + DocInfo + users map entries) where:
    /// - The user always has a permission on the document
    /// - An owner (with 'Own' permission) is always present
    /// - If the user's level is Own, they are the owner
    /// - Additional permissions may be generated
    /// - User info in permissions matches the user's profile (as the DB will fill it in)
    fn doc_info_entry_with_permissions(
        user_id: String,
        user_profile: UserInfo,
    ) -> impl Strategy<Value = (String, DocInfo, HashMap<String, UserInfo>)> {
        (
            any::<String>(),                             // name
            any::<String>(),                             // type_name
            arb::<uuid::Uuid>(),                         // ref_id (used as map key)
            any::<PermissionLevel>(),                    // user's permission_level
            arb::<uuid::Uuid>(),                         // other owner id
            any::<UserInfo>(),                           // other owner info
            0i64..253402300799i64,                       // created_at seconds
            proptest::option::of(0i64..253402300799i64), // deleted_at seconds
        )
            .prop_map(
                move |(
                    name,
                    type_name,
                    ref_id,
                    user_level,
                    other_owner_uuid,
                    other_owner_info,
                    seconds,
                    deleted_seconds,
                )| {
                    let mut permissions = Vec::new();
                    let mut users = HashMap::new();

                    if user_level == PermissionLevel::Own {
                        // User is the owner - use their full profile info as the DB will fill it in
                        permissions.push(PermissionInfo {
                            user: Some(user_id.clone()),
                            level: PermissionLevel::Own,
                        });
                        users.insert(user_id.clone(), user_profile.clone());
                    } else {
                        // Someone else is the owner, user has a different permission
                        let mut other_id = format!("test_{other_owner_uuid}");
                        if other_id == user_id {
                            other_id = format!("{}_other", other_id);
                        }
                        users.insert(other_id.clone(), other_owner_info);
                        permissions.push(PermissionInfo {
                            user: Some(other_id),
                            level: PermissionLevel::Own,
                        });
                        // User has non-owner permission - use their full profile info
                        users.insert(user_id.clone(), user_profile.clone());
                        permissions.push(PermissionInfo {
                            user: Some(user_id.clone()),
                            level: user_level,
                        });
                    }

                    let key = ref_id.to_string();
                    let info = DocInfo {
                        name: Text::from(name),
                        type_name,
                        theory: None,
                        permissions,
                        created_at: Utc
                            .timestamp_opt(seconds, 0)
                            .single()
                            .expect("valid timestamp"),
                        deleted_at: deleted_seconds
                            .map(|s| Utc.timestamp_opt(s, 0).single().expect("valid timestamp")),
                        // TODO: generate arbitrary parent ref IDs
                        parent: None,
                        // Children are computed, not generated independently.
                        children: Vec::new(),
                    };
                    (key, info, users)
                },
            )
    }

    /// Generates a (user_id, UserState) pair where the UserState is consistent
    /// with the user_id (i.e., owned documents have the user as owner, and user
    /// info in permissions matches the profile as the database will fill it in).
    pub fn arbitrary_user_state_with_id() -> impl Strategy<Value = (String, UserState)> {
        (arb::<uuid::Uuid>(), any::<Option<String>>(), any::<Option<String>>()).prop_flat_map(
            |(user_uuid, username, display_name)| {
                let user_id = format!("test_user_{}", user_uuid);
                let username = username.filter(|s| !s.is_empty());
                let display_name = display_name.filter(|s| !s.is_empty());
                let profile = UserInfo {
                    username: username.map(Text::from),
                    display_name: display_name.map(Text::from),
                };
                prop::collection::vec(
                    doc_info_entry_with_permissions(user_id.clone(), profile.clone()),
                    0..5,
                )
                .prop_map(move |entries| {
                    let mut known_users = HashMap::new();
                    let mut documents = HashMap::new();
                    for (key, doc_info, entry_users) in entries {
                        known_users.extend(entry_users);
                        documents.insert(key, doc_info);
                    }
                    (
                        user_id.clone(),
                        UserState {
                            profile: profile.clone(),
                            known_users,
                            documents,
                        },
                    )
                })
            },
        )
    }

    impl Arbitrary for UserState {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            arbitrary_user_state_with_id().prop_map(|(_, state)| state).boxed()
        }
    }
}

#[cfg(all(test, feature = "property-tests"))]
mod tests {
    use super::*;
    use automerge::Automerge;
    use autosurgeon::hydrate;
    use test_strategy::proptest;

    use crate::app::AppError;

    /// Converts an Automerge document to a `UserState`.
    fn automerge_to_user_state(doc: &Automerge) -> Result<UserState, AppError> {
        let state: UserState = hydrate(doc)
            .map_err(|e| AppError::Invalid(format!("Failed to hydrate UserState: {}", e)))?;
        Ok(state)
    }

    /// Tests that converting UserState to Automerge and back yields the same UserState.
    #[proptest(cases = 16)]
    fn user_state_automerge_roundtrip(input_state: UserState) {
        let doc = user_state_to_automerge(&input_state).expect("Failed to convert to Automerge");
        let output_state = automerge_to_user_state(&doc).expect("Failed to convert from Automerge");

        proptest::prop_assert_eq!(input_state, output_state);
    }
}
