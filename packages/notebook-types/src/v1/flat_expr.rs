use uuid::Uuid;

pub enum Chunk {
    Text(String),
    Variable(Vec<Uuid>)
}

pub struct FlatExpr {
    pub chunks: Vec<Chunk>
}
