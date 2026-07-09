use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tsify::Tsify;
use uuid::Uuid;

#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
pub enum CellValue {
    // If the column corresponds to an attribute morphism then we provide the value of the type.
    Null,
    Bool(bool),
    Int(i32),
    Float(f32),
    String(String),
    // If the column corresponds to a mapping morphism then we provide the uuid of the entity.
    EntityRef(Uuid),
}

#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
pub struct TableRow {
    // The row "number".
    id: Uuid,
    // The content of the row, thought of as the predicate-object parts of a semantic triple, i.e. the
    // column and the value.
    content: HashMap<Uuid, CellValue>,
}

#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
pub struct Table {
    // The uuid of the entity to which this table corresponds.
    entity: Uuid,
    // The rows of the table.
    rows: Vec<TableRow>,
}
