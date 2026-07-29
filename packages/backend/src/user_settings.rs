//! User settings.

use serde::{Deserialize, Serialize};

use super::app::{AppCtx, AppError};

/// Settings for a user, these are paired with matching db columns in the user
/// table under the naming scheme "settings_<field_name>".
#[qubit::ts]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UserSettings {
    /// Whether the user has opted into LLM-powered capabilities.
    #[serde(rename = "llmEnabled")]
    pub llm_enabled: bool,
}

/// Obtain settings for the active user.
pub async fn get_active_user_settings(ctx: AppCtx) -> Result<UserSettings, AppError> {
    let Some(user) = ctx.user else {
        return Err(AppError::Unauthorized);
    };

    let settings = sqlx::query_as!(
        UserSettings,
        "SELECT settings_llm_enabled AS llm_enabled FROM users WHERE id = $1",
        user.user_id,
    )
    .fetch_one(&ctx.state.db)
    .await?;

    Ok(settings)
}

/// Set settings for the active user.
pub async fn set_active_user_settings(ctx: AppCtx, settings: UserSettings) -> Result<(), AppError> {
    let Some(user) = ctx.user else {
        return Err(AppError::Unauthorized);
    };

    let result = sqlx::query!(
        "UPDATE users SET settings_llm_enabled = $2 WHERE id = $1",
        user.user_id,
        settings.llm_enabled,
    )
    .execute(&ctx.state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("active user".into()));
    }

    Ok(())
}
