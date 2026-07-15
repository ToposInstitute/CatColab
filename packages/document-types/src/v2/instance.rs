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
    // If the column corresponds to a mapping morphism then we provide the uuid of the entity (i.e. row).
    RowRef(Uuid),
}

#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
pub struct TableRow {
    // The row "number".
    pub id: Uuid,
    // The content of the row, thought of as the predicate-object parts of a semantic triple, i.e. the
    // column and the value.
    pub content: HashMap<Uuid, CellValue>,
}

#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
pub struct Table {
    // The uuid of the table.
    pub id: Uuid,
    // The uuid of the entity to which this table corresponds.
    pub entity: Uuid,
    // The rows of the table.
    pub rows: Vec<TableRow>,
}
