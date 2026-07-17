//! OpenRouter inference key management.
//!
//! Creates OpenRouter child keys per user and persists them in the `users`
//! table. The stable key `hash` is stored alongside the secret so that keys can
//! be invalidated via the OpenRouter API, `DELETE /keys/{hash}`. We leverage
//! the OpenRouter API to put credit cap and refresh windows on the keys.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::app::{AppCtx, AppError};

/// Spending limit per user key, in USD.
const KEY_LIMIT: f64 = 5.0;
/// Reset period for the spending limit.
const KEY_LIMIT_RESET: &str = "daily";

/// The base URL for the OpenRouter key-management API.
pub const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1";

/// Request body for `POST /keys` (create a child key).
#[derive(Serialize)]
struct CreateKeyRequest {
    name: String,
    limit: f64,
    limit_reset: String,
}

/// The `data` object nested inside a `POST /keys` response.
#[derive(Deserialize)]
struct CreateKeyData {
    hash: String,
}

/// Response from `POST /keys`.
#[derive(Deserialize)]
struct CreateKeyResponse {
    key: String,
    data: CreateKeyData,
}

/// Return the user's existing inference key, or create a new one.
pub async fn get_inference_key(ctx: &AppCtx) -> Result<String, AppError> {
    let Some(user) = &ctx.user else {
        return Err(AppError::Unauthorized);
    };

    let provisioning_key = ctx
        .state
        .openrouter_provisioning_key
        .as_ref()
        .ok_or(AppError::InferenceUnavailable)?;

    get_or_create_key(
        &ctx.state.db,
        &ctx.state.http_client,
        &ctx.state.openrouter_base_url,
        provisioning_key,
        &user.user_id,
    )
    .await
}

/// Invalidate a user's inference key, either by Firebase UID or username.
pub async fn invalidate_inference_key(
    db: &sqlx::PgPool,
    http_client: &reqwest::Client,
    base_url: &str,
    provisioning_key: &str,
    identifier: &str,
) -> Result<(), AppError> {
    let row = sqlx::query!(
        "SELECT id, inference_hash FROM users WHERE id = $1 OR username = $1",
        identifier,
    )
    .fetch_optional(db)
    .await?;

    let Some(row) = row else {
        return Ok(());
    };

    let Some(hash) = row.inference_hash else {
        return Ok(());
    };

    openrouter_delete_key(http_client, provisioning_key, base_url, &hash).await?;

    sqlx::query!(
        "UPDATE users SET inference_key = NULL, inference_hash = NULL WHERE id = $1",
        row.id,
    )
    .execute(db)
    .await?;

    Ok(())
}

/// Create a new child key via `POST /keys`.
async fn get_or_create_key(
    db: &sqlx::PgPool,
    http_client: &reqwest::Client,
    base_url: &str,
    provisioning_key: &str,
    user_id: &str,
) -> Result<String, AppError> {
    let existing_key: Option<String> =
        sqlx::query_scalar!("SELECT inference_key FROM users WHERE id = $1", user_id,)
            .fetch_one(db)
            .await?;

    if let Some(key) = existing_key {
        return Ok(key);
    }

    let response = openrouter_create_key(
        http_client,
        provisioning_key,
        base_url,
        &key_name(user_id, provisioning_key),
    )
    .await?;

    sqlx::query!(
        "UPDATE users SET inference_key = $2, inference_hash = $3 WHERE id = $1",
        user_id,
        response.key,
        response.data.hash,
    )
    .execute(db)
    .await?;

    Ok(response.key)
}

/// Create a key using OpenRouter's API.
async fn openrouter_create_key(
    client: &reqwest::Client,
    provisioning_key: &str,
    base_url: &str,
    name: &str,
) -> Result<CreateKeyResponse, AppError> {
    let request = CreateKeyRequest {
        name: name.to_string(),
        limit: KEY_LIMIT,
        limit_reset: KEY_LIMIT_RESET.to_string(),
    };

    let body = serde_json::to_vec(&request)
        .map_err(|e| AppError::OpenRouter(format!("failed to serialize request: {e}")))?;

    let response = client
        .post(format!("{base_url}/keys"))
        .bearer_auth(provisioning_key)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| AppError::OpenRouter(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::OpenRouter(format!("OpenRouter returned {status}: {body}")));
    }

    let bytes = response.bytes().await.map_err(|e| AppError::OpenRouter(e.to_string()))?;

    serde_json::from_slice::<CreateKeyResponse>(&bytes)
        .map_err(|e| AppError::OpenRouter(format!("failed to parse key response: {e}")))
}

/// Delete a child key via OpenRouter's API.
///
/// A `404` response is treated as success: the key is already gone (e.g.
/// deleted out-of-band), which is the desired end state, so the caller may
/// still clear its local reference.
async fn openrouter_delete_key(
    client: &reqwest::Client,
    provisioning_key: &str,
    base_url: &str,
    hash: &str,
) -> Result<(), AppError> {
    let response = client
        .delete(format!("{base_url}/keys/{hash}"))
        .bearer_auth(provisioning_key)
        .send()
        .await
        .map_err(|e| AppError::OpenRouter(e.to_string()))?;

    let status = response.status();

    if status.is_success() || status.as_u16() == 404 {
        return Ok(());
    }

    let body = response.text().await.unwrap_or_default();
    Err(AppError::OpenRouter(format!("OpenRouter returned {status}: {body}")))
}

/// Turn a FireBase user id into a stable name that does not leak details
/// externally.
fn key_name(user_id: &str, provisioning_key: &str) -> String {
    let hash = Sha256::new()
        .chain_update(user_id.as_bytes())
        .chain_update(provisioning_key.as_bytes())
        .finalize();
    let hex: String = hash[..8].iter().map(|b| format!("{b:02x}")).collect();
    format!("catcolab:{hex}")
}
