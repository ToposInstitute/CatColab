use rspc::Router;
use uuid::Uuid;

use super::app::AppCtx;

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
