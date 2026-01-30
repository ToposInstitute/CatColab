use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::app::AppError;
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

#[cfg(feature = "proptest")]
pub mod arbitrary {
    use super::*;
    use crate::auth::PermissionLevel;
    use crate::user::UserSummary;
    use chrono::{TimeZone, Utc};
    use proptest::{arbitrary::Arbitrary, prelude::*};
    use proptest_arbitrary_interop::arb;

    /// Generates a consistent RefStub where:
    /// - If permission_level is Own, the owner matches the user_id parameter
    /// - Otherwise, a separate owner is generated (always present and different from user)
    fn consistent_ref_stub(user_id: String) -> impl Strategy<Value = RefStub> {
        (
            any::<String>(),                            // name
            any::<String>(),                            // type_name
            arb::<uuid::Uuid>(),                        // ref_id
            any::<PermissionLevel>(),                   // permission_level
            any::<UserSummary>(),                       // other owner (always present)
            0i64..253402300799i64,                      // seconds (valid timestamp range)
        )
            .prop_map(move |(name, type_name, ref_id, permission_level, mut other_owner, seconds)| {
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
                        .unwrap_or_else(|| Utc.timestamp_opt(0, 0).single().unwrap()),
                }
            })
    }

    /// Generates a (user_id, UserState) pair where the UserState is consistent
    /// with the user_id (i.e., owned documents have the user as owner).
    /// Each document has a unique owner to avoid conflicts.
    pub fn arbitrary_user_state_with_id() -> impl Strategy<Value = (String, UserState)> {
        arb::<uuid::Uuid>().prop_flat_map(|user_uuid| {
            let user_id = format!("test_user_{}", user_uuid);
            let uid = user_id.clone();
            prop::collection::vec(consistent_ref_stub(user_id), 0..5).prop_map(move |mut documents| {
                // Ensure unique owner IDs and usernames by using UUIDs
                for (i, doc) in documents.iter_mut().enumerate() {
                    if let Some(owner) = &mut doc.owner {
                        if owner.id != uid {
                            // Generate unique owner ID
                            owner.id = format!("owner_{}_{}", uid, i);
                            // Make username unique if present (or None to avoid conflicts)
                            owner.username = None;
                        }
                    }
                }
                (uid.clone(), UserState { documents })
            })
        })
    }

    impl Arbitrary for UserState {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            arbitrary_user_state_with_id()
                .prop_map(|(_, state)| state)
                .boxed()
        }
    }
}
