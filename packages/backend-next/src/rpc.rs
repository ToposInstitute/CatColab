use rspc::Router;
use socketioxide::SocketIo;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct AppCtx {
    pub automerge_io: SocketIo,
    pub db: PgPool,
}

pub fn router() -> Router<AppCtx> {
    Router::<AppCtx>::new()
        .query("doc_id", |t| {
            t(|ctx, ref_id: Uuid| async move {
                let ack = ctx.automerge_io.emit_with_ack::<Vec<String>>("doc_id", ref_id).unwrap();
                let response = ack.await.unwrap();
                assert_eq!(response.data.len(), 1);
                response.data[0].to_string()
            })
        })
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
