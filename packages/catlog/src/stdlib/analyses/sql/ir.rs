//! Theory-agnostic intermediate representation of a database schema.

use crate::zero::QualifiedLabel;

/// Theory-agnostic description of a database schema, ready for SQL rendering.
pub struct SchemaInfo {
    /// Tables in dependency order (tables depended on come first).
    pub tables: Vec<TableInfo>,
}

/// Description of a single SQL table.
pub struct TableInfo {
    /// Table name.
    pub name: QualifiedLabel,
    /// Columns (excluding the auto-generated primary key).
    pub columns: Vec<ColumnInfo>,
}

/// A column in a SQL table, either a foreign key or a data attribute.
pub enum ColumnInfo {
    /// A foreign key column referencing another table's primary key.
    ForeignKey {
        /// Column name.
        name: QualifiedLabel,
        /// Name of the referenced table.
        target_table: QualifiedLabel,
        /// Is this column nullable?
        nullable: bool,
    },
    /// An attribute column with a data type.
    Attribute {
        /// Column name.
        name: QualifiedLabel,
        /// Data type label (e.g. "Int", "Bool", "Hair").
        data_type: QualifiedLabel,
        /// Whether this column allows NULL values.
        nullable: bool,
    },
}
