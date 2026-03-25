use std::collections::HashMap;
use std::fmt;
use std::str::FromStr;

use autosurgeon::{Hydrate, Reconcile, Text, reconcile};
use samod::DocumentId;
use serde::Deserialize;
use sqlx::PgPool;
use tracing::{debug, info};
use ts_rs::TS;

use crate::app::{AppError, AppState};
use crate::auth::PermissionLevel;
use crate::autosurgeon_datetime::{datetime_millis, option_datetime_millis};

/// Default name for documents without a name.
pub const DEFAULT_DOC_NAME: &str = "untitled";

/// Reconcile a `UserState` into an Automerge document, returning an `AppError` on failure.
pub fn reconcile_user_state(
    doc: &mut automerge::Automerge,
    state: &UserState,
) -> Result<(), AppError> {
    doc.transact(|tx| reconcile(tx, state))
        .map_err(|e| AppError::UserStateSync(format!("Failed to reconcile: {:?}", e)))?;
    Ok(())
}

/// The type of a document.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Reconcile, Hydrate, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export_to = "user_state.ts", rename_all = "lowercase")]
#[cfg_attr(not(test), ts(export))]
pub enum DocInfoType {
    /// A model document.
    #[autosurgeon(rename = "model")]
    Model,
    /// A diagram document.
    #[autosurgeon(rename = "diagram")]
    Diagram,
    /// An analysis document.
    #[autosurgeon(rename = "analysis")]
    Analysis,
    /// A document whose type is not recognized by this version of the backend.
    #[autosurgeon(rename = "unknown")]
    Unknown,
}

impl fmt::Display for DocInfoType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DocInfoType::Model => write!(f, "model"),
            DocInfoType::Diagram => write!(f, "diagram"),
            DocInfoType::Analysis => write!(f, "analysis"),
            DocInfoType::Unknown => write!(f, "unknown"),
        }
    }
}

impl FromStr for DocInfoType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "model" => Ok(DocInfoType::Model),
            "diagram" => Ok(DocInfoType::Diagram),
            "analysis" => Ok(DocInfoType::Analysis),
            _ => Ok(DocInfoType::Unknown),
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
    pub level: crate::auth::PermissionLevel,
}

/// A relationship between two documents.
#[cfg_attr(feature = "property-tests", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Reconcile, Hydrate, TS)]
#[ts(rename_all = "camelCase", export_to = "user_state.ts")]
pub struct RelationInfo {
    /// The ref ID of the related document.
    #[autosurgeon(rename = "refId")]
    #[ts(type = "Uint8Array")]
    pub ref_id: uuid::Uuid,
    /// Type of relation to the referenced document.
    #[autosurgeon(rename = "relationType")]
    #[ts(rename = "relationType")]
    pub relation_type: String,
}

/// A snapshot entry in a document's history.
#[cfg_attr(feature = "property-tests", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Reconcile, Hydrate, TS)]
#[ts(rename_all = "camelCase", export_to = "user_state.ts")]
pub struct HistoryEntry {
    /// The Automerge change hashes identifying this snapshot's state.
    pub heads: Vec<String>,
    /// When this snapshot was created.
    #[autosurgeon(rename = "createdAt", with = "datetime_millis")]
    #[ts(type = "number")]
    pub created_at: chrono::DateTime<chrono::Utc>,
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
    /// The type of the document.
    #[autosurgeon(rename = "typeName")]
    pub type_name: DocInfoType,
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
    /// Outgoing relations from this document to other documents.
    #[autosurgeon(rename = "dependsOn")]
    pub depends_on: Vec<RelationInfo>,
    /// Reverse relations: other documents that depend on this one.
    ///
    /// Computed from `depends_on` across all documents. Each entry identifies
    /// the dependent document and the relation type.
    #[autosurgeon(rename = "usedBy")]
    pub used_by: Vec<RelationInfo>,
    /// Manual snapshot history for this document.
    pub history: Vec<HistoryEntry>,
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
    pub fn new() -> Self {
        Self {
            profile: UserInfo { username: None, display_name: None },
            known_users: HashMap::new(),
            documents: HashMap::new(),
        }
    }

    /// Recomputes the `used_by` field of every [`DocInfo`] from the `depends_on` fields.
    ///
    /// A document appears in the `used_by` list of every document it depends on.
    /// This should be called whenever the document map is mutated (initial load,
    /// upsert, or revoke) so that the `used_by` vecs stay consistent.
    pub fn recompute_used_by(&mut self) {
        // Clear all existing used_by vecs.
        for doc in self.documents.values_mut() {
            doc.used_by.clear();
        }

        let pairs: Vec<(String, RelationInfo)> = self
            .documents
            .iter()
            .flat_map(|(key, doc)| {
                let child_uuid = uuid::Uuid::parse_str(key).ok()?;
                Some(doc.depends_on.iter().map(move |rel| {
                    (
                        rel.ref_id.to_string(),
                        RelationInfo {
                            ref_id: child_uuid,
                            relation_type: rel.relation_type.clone(),
                        },
                    )
                }))
            })
            .flatten()
            .collect();

        for (target_key, relation) in pairs {
            if let Some(target_doc) = self.documents.get_mut(&target_key) {
                target_doc.used_by.push(relation);
            }
        }
    }
}

impl Default for UserState {
    fn default() -> Self {
        Self::new()
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

/// A document relation entry as returned from database JSON aggregation.
#[derive(Debug, Deserialize)]
pub struct DbRelation {
    /// Related ref ID in UUID string format.
    pub ref_id: String,
    /// Type of relation.
    #[serde(rename = "relationType")]
    pub relation_type: String,
}

impl DbRelation {
    /// Convert this database relation entry into a [`RelationInfo`].
    pub fn to_relation_info(&self) -> Option<RelationInfo> {
        let ref_id = uuid::Uuid::parse_str(&self.ref_id).ok()?;
        Some(RelationInfo {
            ref_id,
            relation_type: self.relation_type.clone(),
        })
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

/// Extracts document relations from a JSON content tree.
///
/// Recursively walks the JSON tree and collects objects that have both `_id` and `type` keys,
/// returning them as `RelationInfo` entries.
pub fn extract_relations_from_json(value: &serde_json::Value) -> Vec<RelationInfo> {
    let mut relations = Vec::new();
    collect_relations(value, &mut relations);

    // Deduplicate by (ref_id, relation_type)
    relations.sort_by(|a, b| a.ref_id.cmp(&b.ref_id).then(a.relation_type.cmp(&b.relation_type)));
    relations.dedup_by(|a, b| a.ref_id == b.ref_id && a.relation_type == b.relation_type);

    relations
}

fn collect_relations(value: &serde_json::Value, out: &mut Vec<RelationInfo>) {
    match value {
        serde_json::Value::Object(map) => {
            if let (Some(serde_json::Value::String(id)), Some(serde_json::Value::String(ty))) =
                (map.get("_id"), map.get("type"))
                && let Ok(ref_id) = uuid::Uuid::parse_str(id)
            {
                out.push(RelationInfo { ref_id, relation_type: ty.clone() });
            }
            for child in map.values() {
                collect_relations(child, out);
            }
        }
        serde_json::Value::Array(arr) => {
            for child in arr {
                collect_relations(child, out);
            }
        }
        _ => {}
    }
}

/// Reads user state from the database.
pub async fn read_user_state_from_db(user_id: String, db: &PgPool) -> Result<UserState, AppError> {
    debug!(user_id = %user_id, "Reading user state from database");

    let query_start = std::time::Instant::now();

    // Query all documents the user has access to, including public documents.
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
            )
        SELECT
            refs.id AS "ref_id!",
            snapshots.content->>'name' AS name,
            snapshots.content->>'type' AS type_name,
            snapshots.content->>'theory' AS theory,
            refs.created AS "created_at!",
            refs.deleted_at,
            snapshots.content AS "content!",
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
            let depends_on = extract_relations_from_json(&row.content);

            let info = DocInfo {
                name: Text::from(row.name.unwrap_or_else(|| DEFAULT_DOC_NAME.to_string())),
                type_name: row
                    .type_name
                    .as_deref()
                    .unwrap_or("")
                    .parse()
                    .unwrap_or(DocInfoType::Unknown),
                theory: row.theory,
                permissions,
                created_at: row.created_at,
                deleted_at: row.deleted_at,
                depends_on,
                // Reverse relations are computed after all documents are loaded.
                used_by: Vec::new(),
                history: Vec::new(),
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
    user_state.recompute_used_by();
    Ok(user_state)
}

/// Gets the user state document ID for a given user from the database.
pub async fn get_user_state_doc(state: &AppState, user_id: &str) -> Option<DocumentId> {
    let (doc_id_str,): (String,) =
        sqlx::query_as("SELECT state_doc_id FROM users WHERE id = $1 AND state_doc_id IS NOT NULL")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await
            .ok()??;

    DocumentId::from_str(&doc_id_str).ok()
}

/// Gets or creates the user state document for a given user.
pub async fn get_or_create_user_state_doc(
    state: &AppState,
    user_id: &str,
) -> Result<DocumentId, AppError> {
    debug!(user_id = %user_id, "Getting or creating user state document");

    {
        let initialized = state.initialized_user_states.read().await;
        if let Some(doc_id) = initialized.get(user_id) {
            return Ok(doc_id.clone());
        }
    }

    let user_state = read_user_state_from_db(user_id.to_string(), &state.db).await?;
    let doc_id = initialize_user_state_doc(state, user_id, &user_state).await?;

    let mut initialized = state.initialized_user_states.write().await;
    initialized.insert(user_id.to_string(), doc_id.clone());
    Ok(doc_id)
}

/// Converts a `UserState` into an Automerge document.
pub fn user_state_to_automerge(state: &UserState) -> Result<automerge::Automerge, AppError> {
    let mut doc = automerge::Automerge::new();
    reconcile_user_state(&mut doc, state)?;
    Ok(doc)
}

/// Initializes a user state document.
pub async fn initialize_user_state_doc(
    state: &AppState,
    user_id: &str,
    user_state: &UserState,
) -> Result<DocumentId, AppError> {
    let persisted_doc_id: Option<(String,)> =
        sqlx::query_as("SELECT state_doc_id FROM users WHERE id = $1 AND state_doc_id IS NOT NULL")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;

    // If we have a persisted ID, try to find the doc in the repo and re-use it.
    if let Some((doc_id_str,)) = &persisted_doc_id
        && let Ok(doc_id) = DocumentId::from_str(doc_id_str)
    {
        if let Ok(Some(doc_handle)) = state.repo.find(doc_id.clone()).await {
            doc_handle.with_document(|doc| reconcile_user_state(doc, user_state))?;
            debug!(
                user_id = %user_id,
                doc_id = %doc_id,
                "Reconciled existing user state document from DB"
            );
            return Ok(doc_id);
        }
        debug!(
            user_id = %user_id,
            doc_id = %doc_id_str,
            "Persisted state_doc_id not found in repo; creating new document"
        );
    }

    // No existing doc — create a fresh one.
    let doc = user_state_to_automerge(user_state)?;
    let doc_handle = state.repo.create(doc).await?;
    let doc_id = doc_handle.document_id();

    sqlx::query("UPDATE users SET state_doc_id = $2 WHERE id = $1")
        .bind(user_id)
        .bind(doc_id.to_string())
        .execute(&state.db)
        .await?;

    info!(user_id = %user_id, doc_id = %doc_id, "Initialized user state document");

    Ok(doc_id.clone())
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

    impl Arbitrary for DocInfoType {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            prop_oneof![
                Just(DocInfoType::Model),
                Just(DocInfoType::Diagram),
                Just(DocInfoType::Analysis),
                Just(DocInfoType::Unknown),
            ]
            .boxed()
        }
    }

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
                any::<DocInfoType>(),
                proptest::option::of(any::<String>()),
                prop::collection::vec(any::<PermissionInfo>(), 0..5),
                0i64..253402300799i64,
                proptest::option::of(0i64..253402300799i64),
            )
                .prop_map(|(name, type_name, theory, permissions, seconds, deleted_seconds)| {
                    DocInfo {
                        name: Text::from(name),
                        type_name,
                        theory,
                        permissions,
                        created_at: Utc
                            .timestamp_opt(seconds, 0)
                            .single()
                            .expect("valid timestamp"),
                        deleted_at: deleted_seconds
                            .map(|s| Utc.timestamp_opt(s, 0).single().expect("valid timestamp")),
                        // We are not yet generating complete relationship trees, just independent
                        // docs
                        depends_on: Vec::new(),
                        used_by: Vec::new(),
                        history: Vec::new(),
                    }
                })
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
            any::<DocInfoType>(),                        // type_name
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
                        // We are not yet generating complete relationship trees, just independent
                        // docs
                        depends_on: Vec::new(),
                        used_by: Vec::new(),
                        history: Vec::new(),
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

#[cfg(test)]
mod unit_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extract_relations_from_nested_json() {
        let content = json!({
            "name": "My Model",
            "type": "model",
            "theory": "th_signed_category",
            "content": {
                "cells": [
                    {
                        "tag": "ob",
                        "content": {
                            "obType": {
                                "_id": "019532d2-d6a3-7c7e-93c6-6c43419e4233",
                                "type": "model"
                            }
                        }
                    },
                    {
                        "tag": "morphism",
                        "content": {
                            "morType": {
                                "_id": "019532d2-d6a3-7c7e-93c6-6c43419e4234",
                                "type": "diagram"
                            }
                        }
                    }
                ]
            }
        });

        let mut relations = extract_relations_from_json(&content);
        relations.sort_by(|a, b| a.ref_id.cmp(&b.ref_id));

        assert_eq!(relations.len(), 2);
        assert_eq!(
            relations[0].ref_id,
            uuid::Uuid::parse_str("019532d2-d6a3-7c7e-93c6-6c43419e4233").unwrap()
        );
        assert_eq!(relations[0].relation_type, "model");
        assert_eq!(
            relations[1].ref_id,
            uuid::Uuid::parse_str("019532d2-d6a3-7c7e-93c6-6c43419e4234").unwrap()
        );
        assert_eq!(relations[1].relation_type, "diagram");
    }

    #[test]
    fn extract_relations_deduplicates() {
        let content = json!({
            "a": { "_id": "019532d2-d6a3-7c7e-93c6-6c43419e4233", "type": "model" },
            "b": { "_id": "019532d2-d6a3-7c7e-93c6-6c43419e4233", "type": "model" }
        });

        let relations = extract_relations_from_json(&content);
        assert_eq!(relations.len(), 1);
    }

    #[test]
    fn extract_relations_empty_document() {
        let content = json!({ "name": "Empty", "type": "model" });
        // The top-level object has "type" but no "_id", so no relations.
        let relations = extract_relations_from_json(&content);
        assert!(relations.is_empty());
    }
}

#[cfg(all(test, feature = "property-tests"))]
mod tests {
    use super::*;
    use autosurgeon::hydrate;
    use test_strategy::proptest;

    use crate::app::AppError;

    /// Converts an Automerge document to a `UserState`.
    fn automerge_to_user_state(doc: &automerge::Automerge) -> Result<UserState, AppError> {
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
