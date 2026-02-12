use autosurgeon::{Hydrate, Reconcile, Text};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::app::AppError;
use crate::document::{RefQueryParams, RefStub, search_ref_stubs};
use crate::user::UserSummary;

mod text_serde {
    use autosurgeon::Text;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(text: &Text, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(text.as_str())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Text, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Ok(Text::from(value))
    }

    pub mod option {
        use autosurgeon::Text;
        use serde::{Deserialize, Deserializer, Serializer};

        pub fn serialize<S>(value: &Option<Text>, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            match value {
                Some(text) => serializer.serialize_some(text.as_str()),
                None => serializer.serialize_none(),
            }
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Text>, D::Error>
        where
            D: Deserializer<'de>,
        {
            let value = Option::<String>::deserialize(deserializer)?;
            Ok(value.map(Text::from))
        }
    }
}

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
#[derive(Debug, Clone, Serialize, Deserialize, Reconcile, Hydrate)]
pub struct UserStateUserSummary {
    #[serde(with = "text_serde")]
    pub id: Text,
    #[serde(default, with = "text_serde::option")]
    pub username: Option<Text>,
    #[serde(default, rename = "displayName", with = "text_serde::option")]
    #[autosurgeon(rename = "displayName")]
    pub display_name: Option<Text>,
}

#[cfg_attr(feature = "proptest", derive(Eq, PartialEq))]
#[derive(Debug, Clone, Serialize, Deserialize, Reconcile, Hydrate)]
pub struct UserStateRefStub {
    #[serde(with = "text_serde")]
    pub name: Text,
    #[serde(rename = "typeName", with = "text_serde")]
    #[autosurgeon(rename = "typeName")]
    pub type_name: Text,
    #[serde(rename = "refId")]
    #[autosurgeon(rename = "refId")]
    #[key]
    pub ref_id: uuid::Uuid,
    #[serde(rename = "permissionLevel")]
    #[autosurgeon(rename = "permissionLevel")]
    pub permission_level: crate::auth::PermissionLevel,
    pub owner: Option<UserStateUserSummary>,
    #[serde(rename = "createdAt")]
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

impl From<RefStub> for UserStateRefStub {
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
#[derive(Debug, Clone, Serialize, Deserialize, Reconcile, Hydrate)]
pub struct UserState {
    /// The document refs accessible to the user.
    pub documents: Vec<UserStateRefStub>,
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
        documents: result.items.into_iter().map(UserStateRefStub::from).collect(),
    })
}

/// Arbitrary instances for property-based testing.
#[cfg(feature = "proptest")]
pub mod arbitrary {
    #![allow(dead_code)]
    use super::*;
    use crate::auth::PermissionLevel;
    use crate::user::UserSummary;
    use chrono::{TimeZone, Utc};
    use proptest::{arbitrary::Arbitrary, prelude::*};
    use proptest_arbitrary_interop::arb;

    /// Generates a consistent user state ref stub where:
    /// - If permission_level is Own, the owner matches the user_id parameter
    /// - Otherwise, a separate owner is generated (always different from user)
    fn ref_stub_with_owner(user_id: String) -> impl Strategy<Value = UserStateRefStub> {
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
                            id: user_id.clone(),
                            username: None,
                            display_name: None,
                        }
                    } else {
                        if other_owner.id == user_id {
                            other_owner.id = format!("{}_other", other_owner.id);
                        }
                        other_owner
                    };

                    UserStateRefStub {
                        name: name.into(),
                        type_name: type_name.into(),
                        ref_id,
                        permission_level,
                        owner: Some(UserStateUserSummary::from(owner)),
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
