use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tsify::Tsify;
use uuid::Uuid;

/// The value of a single "cell" (i.e. field) in a table row. If the column corresponds to an
/// attribute morphism then we provide the value of the type; if the column corresponds to a
/// mapping morphism then we provide the uuid of the row.
#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
pub enum FieldValue {
    /// Base type: the empty type.
    Null,
    /// Base type: boolean.
    Bool(bool),
    /// Base type: integer.
    Int(i32),
    /// Base type: float.
    Float(f32),
    /// Base type: string.
    String(String),
    /// Mapping type: the uuid of another row.
    RowRef(Uuid),
}

/// A single row of a table.
#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
pub struct TableRow {
    /// The row "number".
    pub id: Uuid,
    /// The content of the row, given as a map from column IDs to values.
    pub fields: HashMap<Uuid, FieldValue>,
}

/// A single table, corresponding to a single entity.
#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
pub struct Table {
    /// The uuid of the entity to which this table corresponds.
    pub id: Uuid,
    /// The rows of the table.
    pub rows: HashMap<Uuid, TableRow>,
    /// The order of the rows of the table.
    pub row_order: Vec<Uuid>,
}

#[cfg(test)]
mod tests {
    use super::Table;
    use serde_json::json;

    #[test]
    fn accepts_qualified_generator_names() {
        let table: Table = serde_json::from_value(json!({
            "id": "019fd6d1-199c-7274-8870-89bb236ef1ab",
            "entity": "019fd6d1-199c-7274-8870-89bb236ef1ab.019fd6d1-199c-7274-8870-89bb236ef1ac",
            "rows": [{
                "id": "019fd6d1-199c-7274-8870-89bb236ef1ad",
                "content": {
                    "019fd6d1-199c-7274-8870-89bb236ef1ab.019fd6d1-199c-7274-8870-89bb236ef1ae": {
                        "tag": "string",
                        "content": "value"
                    }
                }
            }]
        }))
        .expect("qualified names should deserialize");

        assert!(table.entity.contains('.'));
        assert!(table.rows[0].content.keys().next().unwrap().contains('.'));
    }
}
