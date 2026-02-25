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

mod text_value {
    use autosurgeon::reconcile::TextReconciler;
    use autosurgeon::{HydrateError, ReadDoc, Reconciler, Text};

    pub fn reconcile<R: Reconciler>(value: &Text, mut reconciler: R) -> Result<(), R::Error> {
        let mut text = reconciler.text()?;
        text.update(value.as_str())
    }

    pub fn hydrate<D: ReadDoc>(
        doc: &D,
        obj: &automerge::ObjId,
        prop: autosurgeon::Prop<'_>,
    ) -> Result<Text, HydrateError> {
        autosurgeon::hydrate_prop(doc, obj, prop)
    }
}

mod option_text_value {
    use autosurgeon::reconcile::TextReconciler;
    use autosurgeon::{HydrateError, ReadDoc, Reconcile, Reconciler, Text};

    pub fn reconcile<R: Reconciler>(
        value: &Option<Text>,
        mut reconciler: R,
    ) -> Result<(), R::Error> {
        match value {
            Some(text) => {
                let mut out = reconciler.text()?;
                out.update(text.as_str())
            }
            None => Option::<String>::None.reconcile(reconciler),
        }
    }

    pub fn hydrate<D: ReadDoc>(
        doc: &D,
        obj: &automerge::ObjId,
        prop: autosurgeon::Prop<'_>,
    ) -> Result<Option<Text>, HydrateError> {
        autosurgeon::hydrate_prop(doc, obj, prop)
    }
}

/// User summary for user state synchronization.
///
/// This is similar to [`crate::user::UserSummary`] but uses [`Text`] instead of [`String`]
/// for compatibility with Automerge/Autosurgeon serialization.
#[cfg_attr(feature = "property-tests", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Reconcile, Hydrate, TS)]
#[ts(rename_all = "camelCase", export_to = "user_state.ts")]
pub struct UserSummary {
    /// Unique identifier for the user.
    #[autosurgeon(with = "text_value")]
    #[ts(as = "String")]
    pub id: Text,
    /// The user's chosen username, if set.
    #[autosurgeon(with = "option_text_value")]
    #[ts(as = "Option<String>")]
    pub username: Option<Text>,
    /// The user's display name, if set.
    #[autosurgeon(rename = "displayName", with = "option_text_value")]
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
    /// The user this permission applies to, or `None` for the public "anyone" permission.
    pub user: Option<UserSummary>,
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
    #[ts(as = "String")]
    pub type_name: Text,
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
    /// The document refs accessible to the user, keyed by ref UUID string.
    /// We cannot use the Uuid type here because Automerge requires the keys to have a `AsRef<str>` impl.
    pub documents: HashMap<String, DocInfo>,
}

impl UserState {
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
    user_id: Option<String>,
    username: Option<String>,
    display_name: Option<String>,
    level: String,
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
        let user = self.user_id.as_ref().map(|id| UserSummary {
            id: Text::from(id.clone()),
            username: self.username.clone().map(Text::from),
            display_name: self.display_name.clone().map(Text::from),
        });
        Some(PermissionInfo { user, level })
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
            refs.created AS "created_at!",
            refs.deleted_at,
            (COALESCE(
                snapshots.content->'diagramIn'->>'_id',
                snapshots.content->'analysisOf'->>'_id'
            ))::uuid AS "parent: Option<uuid::Uuid>",
            COALESCE(
                (SELECT json_agg(json_build_object(
                    'user_id', p.subject,
                    'username', u.username,
                    'display_name', u.display_name,
                    'level', p.level::text
                ) ORDER BY p.level DESC)
                FROM permissions p
                LEFT JOIN users u ON u.id = p.subject
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
                type_name: Text::from(row.type_name.expect("type_name should never be null")),
                permissions,
                created_at: row.created_at,
                deleted_at: row.deleted_at,
                parent: row.parent.flatten(),
                children: Vec::new(),
            };
            (key, info)
        })
        .collect();

    debug!(
        user_id = %user_id,
        document_count = documents.len(),
        "User state created successfully"
    );

    let mut user_state = UserState { documents };
    user_state.recompute_children();
    Ok(user_state)
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
    {
        let states = state.user_states.read().await;
        if let Some(doc_id) = states.get(user_id) {
            debug!(
                user_id = %user_id,
                doc_id = %doc_id,
                "Found existing user state document"
            );
            return Ok(doc_id.clone());
        }
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

    let doc = user_state_to_automerge(user_state)?;

    let doc_handle = state.repo.create(doc).await?;
    let doc_id = doc_handle.document_id().clone();

    debug!(user_id = %user_id, doc_id = %doc_id, "Document created in repo");

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

    impl Arbitrary for UserSummary {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            (arb::<uuid::Uuid>(), any::<Option<String>>(), any::<Option<String>>())
                .prop_map(|(uuid, username, display_name)| {
                    // Filter out empty strings: the DB has a unique constraint on
                    // username, and empty strings are not valid usernames/display
                    // names in practice.
                    let username = username.filter(|s| !s.is_empty());
                    let display_name = display_name.filter(|s| !s.is_empty());
                    UserSummary {
                        id: Text::from(format!("test_{uuid}")),
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
            (any::<Option<UserSummary>>(), any::<PermissionLevel>())
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
                prop::collection::vec(any::<PermissionInfo>(), 0..5),
                0i64..253402300799i64,
                proptest::option::of(0i64..253402300799i64),
                proptest::option::of(arb::<uuid::Uuid>()),
            )
                .prop_map(|(name, type_name, permissions, seconds, deleted_seconds, parent)| {
                    DocInfo {
                        name: Text::from(name),
                        type_name: Text::from(type_name),
                        permissions,
                        created_at: Utc
                            .timestamp_opt(seconds, 0)
                            .single()
                            .expect("valid timestamp"),
                        deleted_at: deleted_seconds
                            .map(|s| Utc.timestamp_opt(s, 0).single().expect("valid timestamp")),
                        parent,
                        // Children are computed, not generated independently.
                        children: Vec::new(),
                    }
                })
                .boxed()
        }
    }

    /// Generates a consistent user state doc info entry (key + DocInfo) where:
    /// - The user always has a permission on the document
    /// - An owner (with 'Own' permission) is always present
    /// - If the user's level is Own, they are the owner
    /// - Additional permissions may be generated
    fn doc_info_entry_with_permissions(
        user_id: String,
    ) -> impl Strategy<Value = (String, DocInfo)> {
        (
            any::<String>(),                             // name
            any::<String>(),                             // type_name
            arb::<uuid::Uuid>(),                         // ref_id (used as map key)
            any::<PermissionLevel>(),                    // user's permission_level
            any::<UserSummary>(),                        // other owner (always present)
            0i64..253402300799i64,                       // created_at seconds
            proptest::option::of(0i64..253402300799i64), // deleted_at seconds
        )
            .prop_map(
                move |(
                    name,
                    type_name,
                    ref_id,
                    user_level,
                    mut other_owner,
                    seconds,
                    deleted_seconds,
                )| {
                    let mut permissions = Vec::new();

                    if user_level == PermissionLevel::Own {
                        // User is the owner
                        permissions.push(PermissionInfo {
                            user: Some(UserSummary {
                                id: Text::from(user_id.clone()),
                                username: None,
                                display_name: None,
                            }),
                            level: PermissionLevel::Own,
                        });
                    } else {
                        // Someone else is the owner, user has a different permission
                        if other_owner.id.as_str() == user_id {
                            other_owner.id =
                                Text::from(format!("{}_other", other_owner.id.as_str()));
                        }
                        permissions.push(PermissionInfo {
                            user: Some(other_owner),
                            level: PermissionLevel::Own,
                        });
                        permissions.push(PermissionInfo {
                            user: Some(UserSummary {
                                id: Text::from(user_id.clone()),
                                username: None,
                                display_name: None,
                            }),
                            level: user_level,
                        });
                    }

                    let key = ref_id.to_string();
                    let info = DocInfo {
                        name: Text::from(name),
                        type_name: Text::from(type_name),
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
                    (key, info)
                },
            )
    }

    /// Generates a (user_id, UserState) pair where the UserState is consistent
    /// with the user_id (i.e., owned documents have the user as owner).
    pub fn arbitrary_user_state_with_id() -> impl Strategy<Value = (String, UserState)> {
        arb::<uuid::Uuid>().prop_flat_map(|user_uuid| {
            let user_id = format!("test_user_{}", user_uuid);
            prop::collection::vec(doc_info_entry_with_permissions(user_id.clone()), 0..5).prop_map(
                move |entries| {
                    let documents: HashMap<String, DocInfo> = entries.into_iter().collect();
                    (user_id.clone(), UserState { documents })
                },
            )
        })
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
