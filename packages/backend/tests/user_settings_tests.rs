//! Integration tests for user settings.

#[cfg(feature = "integration-tests")]
mod common;

#[cfg(feature = "integration-tests")]
mod integration_tests {
    use crate::common::test_utils::{
        create_test_app_state, create_test_firebase_user, ensure_user_exists, run_migrations,
    };
    use backend::app::{AppCtx, AppError};
    use backend::user_settings::{self, UserSettings};
    use sqlx::PgPool;
    use uuid::Uuid;

    #[sqlx::test]
    async fn user_settings_default_and_persist(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");
        let ctx = AppCtx {
            state: create_test_app_state(pool.clone()).await,
            user: Some(create_test_firebase_user(&user_id)),
        };

        assert_eq!(
            user_settings::get_active_user_settings(ctx.clone()).await.unwrap(),
            UserSettings { llm_enabled: false }
        );

        user_settings::set_active_user_settings(ctx.clone(), UserSettings { llm_enabled: true })
            .await
            .unwrap();

        assert_eq!(
            user_settings::get_active_user_settings(ctx).await.unwrap(),
            UserSettings { llm_enabled: true }
        );
        assert!(
            sqlx::query_scalar::<_, bool>("SELECT settings_llm_enabled FROM users WHERE id = $1")
                .bind(&user_id)
                .fetch_one(&pool)
                .await?
        );

        Ok(())
    }

    #[sqlx::test]
    async fn user_settings_require_authentication(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;

        let anonymous_ctx = AppCtx {
            state: create_test_app_state(pool).await,
            user: None,
        };
        assert!(matches!(
            user_settings::get_active_user_settings(anonymous_ctx.clone()).await,
            Err(AppError::Unauthorized)
        ));
        assert!(matches!(
            user_settings::set_active_user_settings(
                anonymous_ctx,
                UserSettings { llm_enabled: true }
            )
            .await,
            Err(AppError::Unauthorized)
        ));

        Ok(())
    }
}
