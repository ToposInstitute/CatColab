use serde::{Deserialize, Serialize};

use crate::document::RefStub;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserState {
    documents: Vec<RefStub>,
}

#[cfg(test)]
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
