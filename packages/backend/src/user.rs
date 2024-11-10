use super::app::{AppCtx, AppError};

/// Notify the backend that a user has signed up or signed in.
pub async fn sign_up_or_sign_in(ctx: AppCtx) -> Result<(), AppError> {
    if let Some(user) = ctx.user {
        let query = sqlx::query!(
            "
            INSERT INTO users(id, created, signed_in)
            VALUES ($1, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE
            SET signed_in = EXCLUDED.signed_in
            ",
            user.user_id,
        );
        query.execute(&ctx.state.db).await?;
        Ok(())
    } else {
        Err(AppError::Unauthorized)
    }
}
