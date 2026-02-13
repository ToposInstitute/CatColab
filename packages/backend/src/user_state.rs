use autosurgeon::{Hydrate, Reconcile, Text};
use sqlx::PgPool;

use crate::app::AppError;
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

/// User summary for user state synchronization.
///
/// This is similar to [`crate::user::UserSummary`] but uses [`Text`] instead of [`String`]
/// for compatibility with Automerge/Autosurgeon serialization.
#[cfg_attr(feature = "property-tests", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Reconcile, Hydrate)]
pub struct UserSummary {
    /// Unique identifier for the user.
    #[key]
    pub id: Text,
    /// The user's chosen username, if set.
    pub username: Option<Text>,
    /// The user's display name, if set.
    #[autosurgeon(rename = "displayName")]
    pub display_name: Option<Text>,
}

/// Document reference information for user state synchronization.
///
/// Contains lightweight metadata about a document that the user has access to.
#[cfg_attr(feature = "property-tests", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Reconcile, Hydrate)]
pub struct DocInfo {
    /// The name of the document.
    pub name: Text,
    /// The type of the document (e.g., "notebook", "theory").
    #[autosurgeon(rename = "typeName")]
    pub type_name: Text,
    /// Unique identifier for this document reference.
    #[autosurgeon(rename = "refId")]
    #[key]
    pub ref_id: uuid::Uuid,
    /// The user's permission level for this document.
    #[autosurgeon(rename = "permissionLevel")]
    pub permission_level: crate::auth::PermissionLevel,
    /// The owner of the document, if any.
    pub owner: Option<UserSummary>,
    /// When this document was created.
    #[autosurgeon(rename = "createdAt", with = "datetime_millis")]
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// State associated with a user, synchronized via Automerge.
#[cfg_attr(feature = "property-tests", derive(PartialEq, Eq))]
#[derive(Debug, Clone, Reconcile, Hydrate)]
pub struct UserState {
    /// The document refs accessible to the user.
    pub documents: Vec<DocInfo>,
}

/// Reads user state from the database.
pub async fn read_user_state_from_db(user_id: String, db: &PgPool) -> Result<UserState, AppError> {
    // Query documents the user has access to, excluding public documents and deleted refs
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
                    -- exclude deleted refs
                    AND refs.deleted_at IS NULL
            ),
            stubs AS (
                SELECT *
                FROM get_ref_stubs(
                    $1,
                    (SELECT array_agg(id) FROM filtered_ids)
                )
            )
        SELECT
            stubs.ref_id AS "ref_id!",
            stubs.name,
            stubs.type_name,
            stubs.created_at AS "created_at!",
            stubs.permission_level AS "permission_level!: PermissionLevel",
            stubs.owner_id,
            stubs.owner_username,
            stubs.owner_display_name
        FROM stubs
        ORDER BY stubs.created_at DESC;
        "#,
        user_id,
    )
    .fetch_all(db)
    .await?;

    let documents = results
        .into_iter()
        .map(|row| DocInfo {
            ref_id: row.ref_id,
            name: Text::from(row.name.unwrap_or_else(|| "untitled".to_string())),
            type_name: Text::from(row.type_name.expect("type_name should never be null")),
            permission_level: row.permission_level,
            created_at: row.created_at,
            owner: row.owner_id.map(|id| UserSummary {
                id: Text::from(id),
                username: row.owner_username.map(Text::from),
                display_name: row.owner_display_name.map(Text::from),
            }),
        })
        .collect();

    Ok(UserState { documents })
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
            (any::<String>(), any::<Option<String>>(), any::<Option<String>>())
                .prop_map(|(id, username, display_name)| UserSummary {
                    id: Text::from(id),
                    username: username.map(Text::from),
                    display_name: display_name.map(Text::from),
                })
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
                arb::<uuid::Uuid>(),
                any::<PermissionLevel>(),
                any::<Option<UserSummary>>(),
                0i64..253402300799i64,
            )
                .prop_map(|(name, type_name, ref_id, permission_level, owner, seconds)| DocInfo {
                    name: Text::from(name),
                    type_name: Text::from(type_name),
                    ref_id,
                    permission_level,
                    owner,
                    created_at: Utc.timestamp_opt(seconds, 0).single().expect("valid timestamp"),
                })
                .boxed()
        }
    }

    /// Generates a consistent user state doc info where:
    /// - If permission_level is Own, the owner matches the user_id parameter
    /// - Otherwise, a separate owner is generated (always different from user)
    fn doc_info_with_owner(user_id: String) -> impl Strategy<Value = DocInfo> {
        (
            any::<String>(),          // name
            any::<String>(),          // type_name
            arb::<uuid::Uuid>(),      // ref_id
            any::<PermissionLevel>(), // permission_level
            any::<UserSummary>(),     // other owner (always present)
            0i64..253402300799i64,    // seconds (valid timestamp range)
        )
            .prop_map(
                move |(name, type_name, ref_id, permission_level, mut other_owner, seconds)| {
                    let owner = if permission_level == PermissionLevel::Own {
                        UserSummary {
                            id: Text::from(user_id.clone()),
                            username: None,
                            display_name: None,
                        }
                    } else {
                        if other_owner.id.as_str() == user_id {
                            other_owner.id =
                                Text::from(format!("{}_other", other_owner.id.as_str()));
                        }
                        other_owner
                    };

                    DocInfo {
                        name: Text::from(name),
                        type_name: Text::from(type_name),
                        ref_id,
                        permission_level,
                        owner: Some(owner),
                        created_at: Utc
                            .timestamp_opt(seconds, 0)
                            .single()
                            .expect("valid timestamp"),
                    }
                },
            )
    }

    /// Generates a (user_id, UserState) pair where the UserState is consistent
    /// with the user_id (i.e., owned documents have the user as owner).
    /// Documents are sorted by created_at descending to match DB ordering.
    pub fn arbitrary_user_state_with_id() -> impl Strategy<Value = (String, UserState)> {
        arb::<uuid::Uuid>().prop_flat_map(|user_uuid| {
            let user_id = format!("test_user_{}", user_uuid);
            prop::collection::vec(doc_info_with_owner(user_id.clone()), 0..5).prop_map(
                move |mut documents| {
                    // Sort by created_at descending to match default search_ref_stubs ordering
                    documents.sort_by(|a, b| b.created_at.cmp(&a.created_at));
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
    use automerge::{AutoCommit, Automerge};
    use autosurgeon::{hydrate, reconcile};
    use test_strategy::proptest;

    use crate::app::AppError;

    /// Converts a `UserState` into an Automerge document.
    fn user_state_to_automerge(state: &UserState) -> Result<Automerge, AppError> {
        let mut doc = AutoCommit::new();
        reconcile(&mut doc, state)
            .map_err(|e| AppError::Invalid(format!("Failed to reconcile UserState: {}", e)))?;
        let bytes = doc.save();
        let automerge_doc = Automerge::load(&bytes)?;
        Ok(automerge_doc)
    }

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
