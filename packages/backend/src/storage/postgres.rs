use samod::storage::{Storage, StorageKey};
use sqlx::PgPool;
use std::collections::HashMap;

/// A PostgreSQL-backed storage adapter for samod
///
/// ## Database Schema
///
/// The adapter requires a table with the following structure:
/// ```sql
/// CREATE TABLE storage (
///     key text[] PRIMARY KEY,
///     data bytea NOT NULL
/// );
/// ```
#[derive(Clone)]
pub struct PostgresStorage {
    pool: PgPool,
}

impl PostgresStorage {
    /// Constructs a new PostgreSQL storage adapter.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl Storage for PostgresStorage {
    async fn load(&self, key: StorageKey) -> Option<Vec<u8>> {
        let key_parts: Vec<String> = key.into_iter().collect();

        let result = sqlx::query_scalar::<_, Vec<u8>>("SELECT data FROM storage WHERE key = $1")
            .bind(&key_parts)
            .fetch_optional(&self.pool)
            .await;

        match result {
            Ok(data) => data,
            Err(e) => {
                tracing::error!("Failed to load from storage: {}", e);
                None
            }
        }
    }

    async fn load_range(&self, prefix: StorageKey) -> HashMap<StorageKey, Vec<u8>> {
        let prefix_parts: Vec<String> = prefix.into_iter().collect();

        let result = if prefix_parts.is_empty() {
            sqlx::query_as::<_, (Vec<String>, Vec<u8>)>("SELECT key, data FROM storage")
                .fetch_all(&self.pool)
                .await
        } else {
            sqlx::query_as::<_, (Vec<String>, Vec<u8>)>(
                "SELECT key, data FROM storage WHERE key[1:cardinality($1::text[])] = $1::text[]",
            )
            .bind(&prefix_parts)
            .fetch_all(&self.pool)
            .await
        };

        match result {
            Ok(rows) => {
                let mut map = HashMap::new();
                for (key_parts, data) in rows {
                    if let Ok(storage_key) = StorageKey::from_parts(key_parts) {
                        map.insert(storage_key, data);
                    }
                }
                map
            }
            Err(e) => {
                tracing::error!("Failed to load range from storage: {}", e);
                HashMap::new()
            }
        }
    }

    async fn put(&self, key: StorageKey, data: Vec<u8>) {
        let key_parts: Vec<String> = key.into_iter().collect();

        let result = sqlx::query(
            "
            INSERT INTO storage (key, data)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET data = $2
            ",
        )
        .bind(&key_parts)
        .bind(&data)
        .execute(&self.pool)
        .await;

        if let Err(e) = result {
            tracing::error!("Failed to put to storage: {}", e);
        }
    }

    async fn delete(&self, key: StorageKey) {
        let key_parts: Vec<String> = key.into_iter().collect();

        let result = sqlx::query("DELETE FROM storage WHERE key = $1")
            .bind(&key_parts)
            .execute(&self.pool)
            .await;

        if let Err(e) = result {
            tracing::error!("Failed to delete from storage: {}", e);
        }
    }
}
