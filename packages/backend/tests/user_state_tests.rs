use backend::user_state::UserState;
use proptest::{arbitrary::Arbitrary, prelude::*};

proptest! {
    #[test]
    fn generates_user_states_always_true(_state in any::<UserState>()) {
        prop_assert!(true);
    }
}

