use serde::{Deserialize, Serialize};

use crate::document::RefStub;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserState {
    documents: Vec<RefStub>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};
    use proptest::prelude::*;
    use uuid::Uuid;

    use crate::{auth::PermissionLevel, user::UserSummary};

    fn arb_ref_stub() -> impl Strategy<Value = RefStub> {
        (
            any::<String>(),
            any::<String>(),
            any::<[u8; 16]>(),
            any::<PermissionLevel>(),
            prop::option::of(any::<UserSummary>()),
            any::<i64>(),
        )
            .prop_map(
                |(name, type_name, ref_id_bytes, permission_level, owner, seconds)| RefStub {
                    name,
                    type_name,
                    ref_id: Uuid::from_bytes(ref_id_bytes),
                    permission_level,
                    owner,
                    created_at: Utc
                        .timestamp_opt(seconds, 0)
                        .single()
                        .unwrap_or_else(|| Utc.timestamp_opt(0, 0).single().unwrap()),
                },
            )
    }

    fn arb_user_state() -> impl Strategy<Value = UserState> {
        prop::collection::vec(arb_ref_stub(), 0..5).prop_map(|documents| UserState { documents })
    }

    proptest! {
        #[test]
        fn generates_user_states_always_true(_state in arb_user_state()) {
            prop_assert!(true);
        }
    }
}
