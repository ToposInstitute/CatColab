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
    use proptest::{arbitrary::Arbitrary, prelude::*};

    impl Arbitrary for UserState {
        type Parameters = ();
        type Strategy = BoxedStrategy<Self>;

        fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
            prop::collection::vec(any::<RefStub>(), 0..5)
                .prop_map(|documents| UserState { documents })
                .boxed()
        }
    }
}
