use autosurgeon::{Hydrate, Reconcile, Text};
use sqlx::PgPool;

use crate::app::AppError;
use crate::document::{RefQueryParams, RefStub, search_ref_stubs};
use crate::user::UserSummary;

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

#[cfg_attr(feature = "proptest", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Reconcile, Hydrate)]
pub struct UserStateUserSummary {
    #[key]
    pub id: Text,
    pub username: Option<Text>,
    #[autosurgeon(rename = "displayName")]
    pub display_name: Option<Text>,
}

#[cfg_attr(feature = "proptest", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Reconcile, Hydrate)]
pub struct UserDocInfo {
    pub name: Text,
    #[autosurgeon(rename = "typeName")]
    pub type_name: Text,
    #[autosurgeon(rename = "refId")]
    #[key]
    pub ref_id: uuid::Uuid,
    #[autosurgeon(rename = "permissionLevel")]
    pub permission_level: crate::auth::PermissionLevel,
    pub owner: Option<UserStateUserSummary>,
    #[autosurgeon(rename = "createdAt", with = "datetime_millis")]
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<UserSummary> for UserStateUserSummary {
    fn from(value: UserSummary) -> Self {
        Self {
            id: value.id.into(),
            username: value.username.map(Text::from),
            display_name: value.display_name.map(Text::from),
        }
    }
}

impl From<UserStateUserSummary> for UserSummary {
    fn from(value: UserStateUserSummary) -> Self {
        Self {
            id: value.id.as_str().to_string(),
            username: value.username.map(|u| u.as_str().to_string()),
            display_name: value.display_name.map(|d| d.as_str().to_string()),
        }
    }
}

impl From<RefStub> for UserDocInfo {
    fn from(value: RefStub) -> Self {
        Self {
            name: value.name.into(),
            type_name: value.type_name.into(),
            ref_id: value.ref_id,
            permission_level: value.permission_level,
            owner: value.owner.map(UserStateUserSummary::from),
            created_at: value.created_at,
        }
    }
}

/// State associated with a user, synchronized via Automerge.
#[cfg_attr(feature = "proptest", derive(PartialEq, Eq))]
#[derive(Debug, Clone, Reconcile, Hydrate)]
pub struct UserState {
    /// The document refs accessible to the user.
    pub documents: Vec<UserDocInfo>,
}

/// Reads user state from the database.
pub async fn read_user_state_from_db(user_id: String, db: &PgPool) -> Result<UserState, AppError> {
    // Use search_ref_stubs to get documents the user has access to
    let query_params = RefQueryParams {
        owner_username_query: None,
        ref_name_query: None,
        searcher_min_level: None,
        include_public_documents: Some(false),
        only_deleted: Some(false),
        limit: None,
        offset: None,
    };

    let result = search_ref_stubs(Some(user_id), db, query_params).await?;

    Ok(UserState {
        documents: result.items.into_iter().map(UserDocInfo::from).collect(),
    })
}

/// Arbitrary instances for property-based testing.
#[cfg(feature = "proptest")]
pub mod arbitrary {
    #![allow(dead_code)]
    use super::*;
    use autosurgeon::Text;
    use crate::auth::PermissionLevel;
    use chrono::{TimeZone, Utc};
    use proptest::{arbitrary::Arbitrary, prelude::*};
    use proptest_arbitrary_interop::arb;

    impl Arbitrary for UserStateUserSummary {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            (
                any::<String>(),
                any::<Option<String>>(),
                any::<Option<String>>(),
            )
                .prop_map(|(id, username, display_name)| UserStateUserSummary {
                    id: Text::from(id),
                    username: username.map(Text::from),
                    display_name: display_name.map(Text::from),
                })
                .boxed()
        }
    }

    impl Arbitrary for UserDocInfo {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            (
                any::<String>(),
                any::<String>(),
                arb::<uuid::Uuid>(),
                any::<PermissionLevel>(),
                any::<Option<UserStateUserSummary>>(),
                0i64..253402300799i64,
            )
                .prop_map(|(name, type_name, ref_id, permission_level, owner, seconds)| {
                    UserDocInfo {
                        name: Text::from(name),
                        type_name: Text::from(type_name),
                        ref_id,
                        permission_level,
                        owner,
                        created_at: Utc
                            .timestamp_opt(seconds, 0)
                            .single()
                            .expect("valid timestamp"),
                    }
                })
                .boxed()
        }
    }

    /// Generates a consistent user state ref stub where:
    /// - If permission_level is Own, the owner matches the user_id parameter
    /// - Otherwise, a separate owner is generated (always different from user)
    fn ref_stub_with_owner(user_id: String) -> impl Strategy<Value = UserDocInfo> {
        (
            any::<String>(),          // name
            any::<String>(),          // type_name
            arb::<uuid::Uuid>(),      // ref_id
            any::<PermissionLevel>(), // permission_level
            any::<UserStateUserSummary>(), // other owner (always present)
            0i64..253402300799i64,    // seconds (valid timestamp range)
        )
            .prop_map(
                move |(name, type_name, ref_id, permission_level, mut other_owner, seconds)| {
                    let owner = if permission_level == PermissionLevel::Own {
                        UserStateUserSummary {
                            id: Text::from(user_id.clone()),
                            username: None,
                            display_name: None,
                        }
                    } else {
                        if other_owner.id.as_str() == user_id {
                            other_owner.id = Text::from(format!("{}_other", other_owner.id.as_str()));
                        }
                        other_owner
                    };

                    UserDocInfo {
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
            prop::collection::vec(ref_stub_with_owner(user_id.clone()), 0..5).prop_map(
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

#[cfg(all(test, feature = "proptest"))]
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
