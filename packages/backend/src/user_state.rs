use automerge::Automerge;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::app::AppError;
use crate::automerge_json::{hydrate_to_json, populate_automerge_from_json};
use crate::document::{RefQueryParams, RefStub, search_ref_stubs};

#[cfg_attr(feature = "proptest", derive(PartialEq, Eq))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserState {
    pub documents: Vec<RefStub>,
}

/// Reads user state from the database.
pub async fn read_user_state_from_db(user_id: String, db: &PgPool) -> Result<UserState, AppError> {
    // Use search_ref_stubs to get documents the user has access to
    let query_params = RefQueryParams {
        owner_username_query: None,
        ref_name_query: None,
        searcher_min_level: None,
        include_public_documents: Some(true),
        only_deleted: Some(false),
        limit: None,
        offset: None,
    };

    let result = search_ref_stubs(Some(user_id), db, query_params).await?;

    Ok(UserState {
        documents: result.items,
    })
}

/// Converts a `UserState` into an Automerge document.
pub fn user_state_to_automerge(state: &UserState) -> Result<Automerge, AppError> {
    let json_value = serde_json::to_value(state)?;

    let mut doc = Automerge::new();
    let mut tx = doc.transaction();
    populate_automerge_from_json(&mut tx, automerge::ROOT, &json_value)?;
    tx.commit();

    Ok(doc)
}

/// Converts an Automerge document to a `UserState`.
pub fn automerge_to_user_state(doc: &Automerge) -> Result<UserState, AppError> {
    let hydrated = doc.hydrate(None);
    let json_value = hydrate_to_json(&hydrated);
    let state = serde_json::from_value(json_value)?;
    Ok(state)
}

#[cfg(feature = "proptest")]
pub mod arbitrary {
    #![allow(dead_code)]
    use super::*;
    use crate::auth::PermissionLevel;
    use crate::user::UserSummary;
    use chrono::{TimeZone, Utc};
    use proptest::{arbitrary::Arbitrary, prelude::*};
    use proptest_arbitrary_interop::arb;

    /// Generates a consistent RefStub where:
    /// - If permission_level is Own, the owner matches the user_id parameter
    /// - Otherwise, a separate owner is generated (always different from user)
    fn ref_stub_with_owner(user_id: String) -> impl Strategy<Value = RefStub> {
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
                    // Determine owner based on permission level
                    let owner = if permission_level == PermissionLevel::Own {
                        // User is the owner
                        UserSummary {
                            id: user_id.clone(),
                            username: None,
                            display_name: None,
                        }
                    } else {
                        // Someone else is the owner - ensure they're different from user
                        if other_owner.id == user_id {
                            other_owner.id = format!("{}_other", other_owner.id);
                        }
                        other_owner
                    };

                    RefStub {
                        name,
                        type_name,
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
    use test_strategy::proptest;

    /// Tests that converting UserState to Automerge and back yields the same UserState.
    #[proptest(cases = 16)]
    fn user_state_automerge_roundtrip(input_state: UserState) {
        let doc = user_state_to_automerge(&input_state).expect("Failed to convert to Automerge");
        let output_state =
            automerge_to_user_state(&doc).expect("Failed to convert from Automerge");

        proptest::prop_assert_eq!(input_state, output_state);
    }
}


