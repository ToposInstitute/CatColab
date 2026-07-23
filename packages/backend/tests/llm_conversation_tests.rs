//! Integration tests for LLM conversation backend behavior.

#[cfg(feature = "integration-tests")]
mod common;

#[cfg(feature = "integration-tests")]
mod integration_tests {
    use crate::common::test_utils::{
        create_test_app_state, create_test_document_content, create_test_firebase_user,
        ensure_user_exists, run_migrations,
    };
    use backend::app::AppCtx;
    use backend::document;
    use backend::user_state::read_user_state_from_db;
    use serde_json::json;
    use sqlx::PgPool;
    use uuid::Uuid;

    fn create_llm_conversation_content(name: &str, parent_ref_id: Uuid) -> serde_json::Value {
        json!({
            "version": "2",
            "type": "llmconversation",
            "name": name,
            "llmConversationOf": {
                "_id": parent_ref_id.to_string(),
                "_version": null,
                "_server": "test",
                "type": "llmconversation-of"
            },
            "llmModel": "test-model",
            "interactions": []
        })
    }

    /// A conversation should be indexed as depending on its parent model.
    #[sqlx::test]
    async fn conversation_relation_is_indexed(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        let ctx = AppCtx {
            state,
            user: Some(create_test_firebase_user(&user_id)),
        };
        let parent_id =
            document::new_ref(ctx.clone(), create_test_document_content("Parent Model"))
                .await
                .unwrap();
        let conversation_id =
            document::new_ref(ctx, create_llm_conversation_content("Conversation", parent_id))
                .await
                .unwrap();

        let user_state = read_user_state_from_db(user_id, &pool).await.unwrap();
        let parent = &user_state.documents[&parent_id.to_string()];
        let conversation = &user_state.documents[&conversation_id.to_string()];

        assert_eq!(conversation.depends_on.len(), 1);
        assert_eq!(conversation.depends_on[0].ref_id, parent_id);
        assert_eq!(conversation.depends_on[0].relation_type, "llmconversation-of");
        assert_eq!(parent.used_by.len(), 1);
        assert_eq!(parent.used_by[0].ref_id, conversation_id);
        assert_eq!(parent.used_by[0].relation_type, "llmconversation-of");

        Ok(())
    }
}
