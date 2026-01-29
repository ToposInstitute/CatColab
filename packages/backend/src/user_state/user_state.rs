use serde::{Deserialize, Serialize};

use crate::document::RefStub;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserState {
    documents: Vec<RefStub>,
}

#[cfg(test)]
mod tests {
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

    proptest! {
        #[test]
        fn generates_user_states_always_true(_state in any::<UserState>()) {
            prop_assert!(true);
        }
    }
}
