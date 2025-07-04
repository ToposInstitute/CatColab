use sqlx::Postgres;
use sqlx_migrator::migration::Migration;
use sqlx_migrator::vec_box;

mod m20241004010448_document_refs;
mod m20241025030906_users;
mod m20250409171833_add_permissions_object_subject_idx;
mod m20250516154702_automerge_storage;
mod m20250704125636_get_ref_stubs;

pub fn migrations() -> Vec<Box<dyn Migration<Postgres>>> {
    vec_box![
        m20241004010448_document_refs::DocumentRefs,
        m20241025030906_users::Users,
        m20250409171833_add_permissions_object_subject_idx::AddPermissionsObjectSubjectIdx,
        m20250516154702_automerge_storage::AutomergeStorage,
        m20250704125636_get_ref_stubs::GetRefStubs,
    ]
}
