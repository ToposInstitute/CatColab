use serde::Deserialize;
use serde_json::Value;
use socketioxide::extract::{Data, SocketRef};
use uuid::Uuid;

use super::app::AppCtx;

#[derive(Debug, Deserialize)]
struct AutosaveData {
    #[serde(rename = "refId")]
    ref_id: Uuid,
    content: Value,
}

/// Set up the socket that communicates with the Automerge doc server.
pub fn setup_automerge_socket(ctx: AppCtx) {
    ctx.automerge_io.ns("/", |socket: SocketRef| {
        println!("Automerge socket connected at namespace {:?}", socket.ns());

        socket.on("autosave", |_: SocketRef, Data::<AutosaveData>(data)| async move {
            let query = sqlx::query!(
                "
                INSERT INTO snapshots(content)
                VALUES ($1)
                RETURNING id;
                ",
                data.content
            );
            let snapshot_id = query.fetch_one(&ctx.db).await.unwrap().id;
            let query = sqlx::query!(
                "
                UPDATE refs
                SET autosave = $2, last_updated = NOW()
                WHERE id = $1;
                ",
                data.ref_id,
                snapshot_id
            );
            query.execute(&ctx.db).await.unwrap();
        });
    });
}
