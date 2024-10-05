use rspc::Router;
use serde_json::Value;
use uuid::Uuid;

use super::app::{AppCtx, RefContent};

pub fn router() -> Router<AppCtx> {
    Router::<AppCtx>::new()
        .mutation("new_ref", |t| t(|ctx, content: Value| ctx.new_ref(content)))
        .mutation("save_snapshot", |t| t(|ctx, data: RefContent| ctx.save_snapshot(data)))
        .query("doc_id", |t| t(|ctx, ref_id: Uuid| ctx.doc_id(ref_id)))
        .build()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    #[test]
    fn rspc_type_defs() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pkg").join("types.ts");
        super::router().export_ts(path).unwrap();
    }
}
