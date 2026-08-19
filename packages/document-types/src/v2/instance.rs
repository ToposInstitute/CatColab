use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tsify::Tsify;
use uuid::Uuid;

/// The value of a single "cell" (i.e. field) in a table row. If the column corresponds to an
/// attribute morphism then we provide the value of the type; if the column corresponds to a
/// mapping morphism then we provide the uuid of the row.
#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
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
#[tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)]
pub struct TableRow {
    /// The content of the row, given as a map from morphism `QualifiedName` to values.
    pub fields: HashMap<String, FieldValue>,
}

/// A single table, corresponding to a single entity.
#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)]
pub struct Table {
    /// The rows of the table.
    pub rows: HashMap<Uuid, TableRow>,
    /// The order of the rows of the table.
    #[serde(rename = "rowOrder")]
    pub row_order: Vec<Uuid>,
}

#[cfg(test)]
mod test {
    use super::*;
    use serde_json::Value;

    #[test]
    fn tables_are_keyed_by_schema_entity_id_in_json() {
        let row_id = Uuid::from_u128(1);
        let col_id = Uuid::from_u128(2);
        let ent_id = Uuid::from_u128(3).to_string();

        let mut fields = HashMap::new();
        fields.insert(col_id.to_string(), FieldValue::Int(42));

        let mut rows = HashMap::new();
        rows.insert(row_id, TableRow { fields });

        let table = Table { rows, row_order: vec![row_id] };

        let mut tables = HashMap::new();
        tables.insert(ent_id.clone(), table);

        let value = serde_json::to_value(&tables).expect("serialize to JSON");

        // Schema entity and row IDs must be plain strings in JSON objects.
        let table_obj = value.get(&ent_id).and_then(Value::as_object).expect("table object");
        let rows_obj = table_obj.get("rows").and_then(Value::as_object).expect("rows object");
        assert!(rows_obj.contains_key(&row_id.to_string()));

        let round_tripped: HashMap<String, Table> =
            serde_json::from_value(value).expect("deserialize from JSON");
        assert_eq!(round_tripped, tables);
    }

    #[test]
    fn multi_segment_key_round_trips() {
        let a = Uuid::from_u128(10);
        let b = Uuid::from_u128(11);
        let row_id = Uuid::from_u128(13);

        // Paths of UUIDs are represented as dot-separated strings.
        let key = format!("{a}.{b}");

        let mut fields = HashMap::new();
        fields.insert(key.clone(), FieldValue::RowRef(row_id));

        let mut rows = HashMap::new();
        rows.insert(row_id, TableRow { fields });

        let table = Table { rows, row_order: vec![row_id] };

        let value = serde_json::to_value(&table).expect("serialize to JSON");

        let fields_obj = value
            .pointer(&format!("/rows/{row_id}/fields"))
            .and_then(Value::as_object)
            .expect("fields object");
        assert!(fields_obj.contains_key(&key));

        let round_tripped: Table = serde_json::from_value(value).expect("deserialize from JSON");
        assert_eq!(round_tripped, table);
    }
}
