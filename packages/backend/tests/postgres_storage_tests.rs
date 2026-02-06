//! Tests the Postgres storage adapter for Automerge.

use backend::storage::{PostgresStorage, testing};
use sqlx::PgPool;

async fn cleanup_test_data(pool: &PgPool) {
    let _ = sqlx::query("DELETE FROM storage WHERE key[1] = ANY($1)")
        .bind(["AAAAA", "BBBBB", "storage-adapter-id"])
        .execute(pool)
        .await;
}

struct PostgresTestFixture {
    storage: PostgresStorage,
    pool: PgPool,
}

impl testing::StorageTestFixture for PostgresTestFixture {
    type Storage = PostgresStorage;

    async fn setup() -> Self {
        let database_url =
            std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");

        let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");

        cleanup_test_data(&pool).await;

        let storage = PostgresStorage::new(pool.clone());

        Self { storage, pool }
    }

    fn storage(&self) -> &PostgresStorage {
        &self.storage
    }

    async fn teardown(self) {
        cleanup_test_data(&self.pool).await;
    }
}

#[tokio::test]
async fn postgres_storage_adapter_tests() {
    // Skip test if DATABASE_URL is not set (e.g., in CI without postgres)
    if std::env::var("DATABASE_URL").is_err() {
        eprintln!("Skipping postgres_storage_adapter_tests: DATABASE_URL not set");
        return;
    }

    testing::run_storage_adapter_tests::<PostgresTestFixture>().await;
}
