use rspc::Router;
use serde::Serialize;
use socketioxide::SocketIo;
use specta::Type;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct AppCtx {
    pub automerge_io: SocketIo,
    pub db: PgPool,
}

impl AppCtx {
    /// Creates a new document ref.
    pub async fn new_ref(self, taxon: String) -> NewRef {
        let ref_id = Uuid::now_v7();
        let query = sqlx::query!(
            "
            INSERT INTO refs(id, taxon, last_updated)
            VALUES ($1, $2, NOW())
            ",
            ref_id,
            taxon
        );
        query.execute(&self.db).await.unwrap();
        let doc_id = self.doc_id(ref_id).await;
        NewRef { ref_id, doc_id }
    }

    /// Gets the ID of the Automerge document handle for document ref.
    pub async fn doc_id(self, ref_id: Uuid) -> String {
        let ack = self.automerge_io.emit_with_ack::<Vec<String>>("doc_id", ref_id).unwrap();
        let response = ack.await.unwrap();
        assert_eq!(response.data.len(), 1);
        response.data[0].to_string()
    }
}

#[derive(Debug, Serialize, Type)]
pub struct NewRef {
    #[serde(rename = "refId")]
    ref_id: Uuid,
    #[serde(rename = "docId")]
    doc_id: String,
}

pub fn router() -> Router<AppCtx> {
    Router::<AppCtx>::new()
        .mutation("new_ref", |t| t(|ctx, taxon: String| ctx.new_ref(taxon)))
        .query("doc_id", |t| t(|ctx, ref_id: Uuid| ctx.doc_id(ref_id)))
        .build()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    #[test]
    fn rspc_type_defs() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pkg").join("index.d.ts");
        super::router().export_ts(path).unwrap();
    }
}
