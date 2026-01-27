//! Storage adapter testing utilities
//!
//! rewritten from:
//! automerge-repo/packages/automerge-repo/src/helpers/tests/storage-adapter-tests.ts
//!
//! Provides a test suite for any implementation of the `Storage` trait.
//! Based on the TypeScript `runStorageAdapterTests` from automerge-repo.

#![allow(dead_code)]

use rand::Rng;
use samod::storage::{Storage, StorageKey};
use std::future::Future;
use std::pin::Pin;
use std::sync::LazyLock;

pub fn payload_a() -> Vec<u8> {
    vec![0, 1, 127, 99, 154, 235]
}

pub fn payload_b() -> Vec<u8> {
    vec![1, 76, 160, 53, 57, 10, 230]
}

pub fn payload_c() -> Vec<u8> {
    vec![2, 111, 74, 131, 236, 96, 142, 193]
}

static LARGE_PAYLOAD: LazyLock<Vec<u8>> = LazyLock::new(|| {
    let mut vec = vec![0u8; 100000];
    rand::thread_rng().fill(&mut vec[..]);
    vec
});

pub fn large_payload() -> Vec<u8> {
    LARGE_PAYLOAD.clone()
}

/// Trait for storage test fixtures
pub trait StorageTestFixture: Sized + Send {
    /// The storage type being tested
    type Storage: Storage + Send + Sync + 'static;

    /// Setup the test fixture
    fn setup() -> impl std::future::Future<Output = Self> + Send;

    /// Get reference to the storage adapter
    fn storage(&self) -> &Self::Storage;

    /// Optional cleanup
    fn teardown(self) -> impl std::future::Future<Output = ()> + Send {
        async {}
    }
}

/// Helper to run a single test with setup and teardown
async fn run_test<F, TestFn>(test_fn: TestFn)
where
    F: StorageTestFixture,
    TestFn: for<'a> FnOnce(&'a F::Storage) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> + Send,
{
    let fixture = F::setup().await;
    test_fn(fixture.storage()).await;
    fixture.teardown().await;
}

/// Run all storage adapter acceptance tests
pub async fn run_storage_adapter_tests<F: StorageTestFixture>() {
    run_test::<F, _>(|a| Box::pin(test_load_should_return_none_if_no_data(a))).await;
    run_test::<F, _>(|a| Box::pin(test_save_and_load_should_return_data_that_was_saved(a))).await;
    run_test::<F, _>(|a| Box::pin(test_save_and_load_should_work_with_composite_keys(a))).await;
    run_test::<F, _>(|a| Box::pin(test_save_and_load_should_work_with_large_payload(a))).await;
    run_test::<F, _>(|a| Box::pin(test_load_range_should_return_empty_if_no_data(a))).await;
    run_test::<F, _>(|a| Box::pin(test_save_and_load_range_should_return_all_matching_data(a)))
        .await;
    run_test::<F, _>(|a| Box::pin(test_save_and_load_range_should_only_load_matching_values(a)))
        .await;
    run_test::<F, _>(|a| Box::pin(test_save_and_remove_should_be_empty_after_removing(a))).await;
    run_test::<F, _>(|a| Box::pin(test_save_and_save_should_overwrite(a))).await;
}

// describe("load")
pub async fn test_load_should_return_none_if_no_data<S: Storage>(adapter: &S) {
    let actual = adapter
        .load(StorageKey::from_parts(["AAAAA", "sync-state", "xxxxx"]).unwrap())
        .await;

    assert_eq!(actual, None);
}

// describe("save and load")
pub async fn test_save_and_load_should_return_data_that_was_saved<S: Storage>(adapter: &S) {
    let key = StorageKey::from_parts(["storage-adapter-id"]).unwrap();
    adapter.put(key.clone(), payload_a()).await;

    let actual = adapter.load(key).await;

    assert_eq!(actual, Some(payload_a()));
}

pub async fn test_save_and_load_should_work_with_composite_keys<S: Storage>(adapter: &S) {
    let key = StorageKey::from_parts(["AAAAA", "sync-state", "xxxxx"]).unwrap();
    adapter.put(key.clone(), payload_a()).await;

    let actual = adapter.load(key).await;

    assert_eq!(actual, Some(payload_a()));
}

pub async fn test_save_and_load_should_work_with_large_payload<S: Storage>(adapter: &S) {
    let key = StorageKey::from_parts(["AAAAA", "sync-state", "xxxxx"]).unwrap();
    adapter.put(key.clone(), large_payload()).await;

    let actual = adapter.load(key).await;

    assert_eq!(actual, Some(large_payload()));
}

// describe("loadRange")
pub async fn test_load_range_should_return_empty_if_no_data<S: Storage>(adapter: &S) {
    let result = adapter.load_range(StorageKey::from_parts(["AAAAA"]).unwrap()).await;

    assert_eq!(result.len(), 0);
}

// describe("save and loadRange")
pub async fn test_save_and_load_range_should_return_all_matching_data<S: Storage>(adapter: &S) {
    let key_a = StorageKey::from_parts(["AAAAA", "sync-state", "xxxxx"]).unwrap();
    let key_b = StorageKey::from_parts(["AAAAA", "snapshot", "yyyyy"]).unwrap();
    let key_c = StorageKey::from_parts(["AAAAA", "sync-state", "zzzzz"]).unwrap();

    adapter.put(key_a.clone(), payload_a()).await;
    adapter.put(key_b.clone(), payload_b()).await;
    adapter.put(key_c.clone(), payload_c()).await;

    let result = adapter.load_range(StorageKey::from_parts(["AAAAA"]).unwrap()).await;

    assert_eq!(result.len(), 3);
    assert_eq!(result.get(&key_a), Some(&payload_a()));
    assert_eq!(result.get(&key_b), Some(&payload_b()));
    assert_eq!(result.get(&key_c), Some(&payload_c()));

    let sync_result = adapter
        .load_range(StorageKey::from_parts(["AAAAA", "sync-state"]).unwrap())
        .await;

    assert_eq!(sync_result.len(), 2);
    assert_eq!(sync_result.get(&key_a), Some(&payload_a()));
    assert_eq!(sync_result.get(&key_c), Some(&payload_c()));
}

pub async fn test_save_and_load_range_should_only_load_matching_values<S: Storage>(adapter: &S) {
    let key_a = StorageKey::from_parts(["AAAAA", "sync-state", "xxxxx"]).unwrap();
    let key_c = StorageKey::from_parts(["BBBBB", "sync-state", "zzzzz"]).unwrap();

    adapter.put(key_a.clone(), payload_a()).await;
    adapter.put(key_c.clone(), payload_c()).await;

    let actual = adapter.load_range(StorageKey::from_parts(["AAAAA"]).unwrap()).await;

    assert_eq!(actual.len(), 1);
    assert_eq!(actual.get(&key_a), Some(&payload_a()));
}

// describe("save and remove")
pub async fn test_save_and_remove_should_be_empty_after_removing<S: Storage>(adapter: &S) {
    let key = StorageKey::from_parts(["AAAAA", "snapshot", "xxxxx"]).unwrap();
    adapter.put(key.clone(), payload_a()).await;
    adapter.delete(key.clone()).await;

    let range_result = adapter.load_range(StorageKey::from_parts(["AAAAA"]).unwrap()).await;
    assert_eq!(range_result.len(), 0);

    let load_result = adapter.load(key).await;
    assert_eq!(load_result, None);
}

// describe("save and save")
pub async fn test_save_and_save_should_overwrite<S: Storage>(adapter: &S) {
    let key = StorageKey::from_parts(["AAAAA", "sync-state", "xxxxx"]).unwrap();
    adapter.put(key.clone(), payload_a()).await;
    adapter.put(key.clone(), payload_b()).await;

    let result = adapter
        .load_range(StorageKey::from_parts(["AAAAA", "sync-state"]).unwrap())
        .await;

    assert_eq!(result.len(), 1);
    assert_eq!(result.get(&key), Some(&payload_b()));
}
