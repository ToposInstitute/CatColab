//! SQL DDL rendering from a [`SchemaInfo`].

use itertools::Itertools;
use sea_query::SchemaBuilder;
use sea_query::{
    ColumnDef, ForeignKey, ForeignKeyCreateStatement, Iden, MysqlQueryBuilder,
    PostgresQueryBuilder, SqliteQueryBuilder, Table, TableCreateStatement, prepare::Write,
};
use sqlformat::{Dialect, format};
use std::fmt;

use crate::{
    dbl::modal::theory::ModalObType,
    dbl::model::*,
    dbl::theory::NonUnital,
    zero::{QualifiedLabel, QualifiedName},
};

use super::extract_discrete::*;
use super::extract_modal::*;
use super::ir::*;

impl Iden for QualifiedName {
    fn unquoted(&self, s: &mut dyn Write) {
        Iden::unquoted(&format!("{self}").as_str(), s)
    }
}

impl Iden for QualifiedLabel {
    fn unquoted(&self, s: &mut dyn Write) {
        Iden::unquoted(&format!("{self}").as_str(), s)
    }
}

impl Iden for &QualifiedLabel {
    fn unquoted(&self, s: &mut dyn Write) {
        Iden::unquoted(&format!("{self}").as_str(), s)
    }
}

/// Struct for building a valid SQL DDL.
pub struct SQLAnalysis {
    backend: SQLBackend,
}

impl SQLAnalysis {
    /// Constructs a new SQLAnalysis instance.
    pub fn new(backend: SQLBackend) -> Self {
        Self { backend }
    }

    /// Renders a [`SchemaInfo`] into a SQL DDL string.
    pub fn render_schema(&self, info: &SchemaInfo) -> String {
        let tables: Vec<TableCreateStatement> =
            info.tables.iter().map(|t| self.make_table(t)).collect();

        let output: String = tables
            .iter()
            .map(|table| match self.backend {
                SQLBackend::MySQL => table.to_string(MysqlQueryBuilder),
                SQLBackend::SQLite => table.to_string(SqliteQueryBuilder),
                SQLBackend::PostgresSQL => table.to_string(PostgresQueryBuilder),
            })
            .join(";\n")
            + ";";

        let formatted_output = format(
            &output,
            &sqlformat::QueryParams::None,
            &sqlformat::FormatOptions {
                lines_between_queries: 2,
                dialect: self.backend.clone().into(),
                ..Default::default()
            },
        );

        match self.backend {
            SQLBackend::SQLite => ["PRAGMA foreign_keys = ON", &formatted_output].join(";\n\n"),
            _ => formatted_output,
        }
    }

    /// Convenience: extracts schema info from a discrete model and renders SQL.
    pub fn render(
        &self,
        model: &DiscreteDblModel,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
        mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> Result<String, String> {
        let info = schema_info_from_discrete(model, ob_label, mor_label)?;
        Ok(self.render_schema(&info))
    }

    /// Convenience: extracts schema info from a modal (non-unital) model and renders SQL.
    ///
    /// The `table_ob_type` specifies which object type represents tables.
    pub fn render_modal(
        &self,
        model: &ModalDblModel<NonUnital>,
        table_ob_type: &ModalObType,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
        mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> Result<String, String> {
        let info = schema_info_from_modal(model, table_ob_type, ob_label, mor_label)?;
        Ok(self.render_schema(&info))
    }

    fn fk(
        &self,
        src_name: QualifiedLabel,
        tgt_name: QualifiedLabel,
        mor_name: QualifiedLabel,
    ) -> ForeignKeyCreateStatement {
        ForeignKey::create()
            .name(format!("FK_{}_{}_{}", mor_name, src_name, tgt_name))
            .from(src_name.clone(), mor_name)
            .to(tgt_name.clone(), "id")
            .to_owned()
    }

    fn make_table(&self, info: &TableInfo) -> TableCreateStatement {
        let mut tbl = Table::create();
        let table_name = info.name.clone();

        tbl.table(table_name.clone())
            .if_not_exists()
            .col(ColumnDef::new("id").integer().not_null().auto_increment().primary_key());

        // Add all columns.
        for col in &info.columns {
            match col {
                ColumnInfo::ForeignKey { name, nullable, .. } => {
                    let mut col_def = ColumnDef::new(name.clone());
                    col_def.integer();
                    if !nullable {
                        col_def.not_null();
                    } else {
                        col_def.null();
                    }
                    tbl.col(col_def);
                }
                ColumnInfo::Attribute { name, data_type, nullable } => {
                    let mut col_def = ColumnDef::new(name.clone());
                    if !nullable {
                        col_def.not_null();
                    } else {
                        col_def.null();
                    }
                    add_column_type(&mut col_def, data_type);
                    tbl.col(col_def);
                }
            }
        }

        // Add foreign key constraints.
        for col in &info.columns {
            if let ColumnInfo::ForeignKey { name, target_table, .. } = col {
                tbl.foreign_key(&mut self.fk(
                    table_name.clone(),
                    target_table.clone(),
                    name.clone(),
                ));
            }
        }

        tbl.to_owned()
    }
}

/// Variants of SQL backends. Each correspond to types which implement the
/// `SchemaBuilder` trait that is used to render into the correct backend. The `SchemaBuilder` and
/// the types implementing that trait are owned by `sea_query`.
#[derive(Debug, Clone)]
pub enum SQLBackend {
    /// The MySQL backend.
    MySQL,

    /// The SQLite3 backend.
    SQLite,

    /// The Postgres backend.
    PostgresSQL,
}

impl SQLBackend {
    /// Produces a boxed implementation of the SchemaBuilder trait.
    pub fn as_type(&self) -> Box<dyn SchemaBuilder> {
        match self {
            SQLBackend::MySQL => Box::new(MysqlQueryBuilder),
            SQLBackend::SQLite => Box::new(SqliteQueryBuilder),
            SQLBackend::PostgresSQL => Box::new(PostgresQueryBuilder),
        }
    }
}

impl From<SQLBackend> for Dialect {
    fn from(backend: SQLBackend) -> sqlformat::Dialect {
        match backend {
            SQLBackend::PostgresSQL => Dialect::PostgreSql,
            _ => Dialect::Generic,
        }
    }
}

impl TryFrom<&str> for SQLBackend {
    type Error = String;
    fn try_from(backend: &str) -> Result<Self, Self::Error> {
        match backend {
            "MySQL" => Ok(SQLBackend::MySQL),
            "SQLite" => Ok(SQLBackend::SQLite),
            "PostgresSQL" => Ok(SQLBackend::PostgresSQL),
            _ => Err(String::from("Invalid backend")),
        }
    }
}

impl fmt::Display for SQLBackend {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let string = match self {
            SQLBackend::MySQL => "MySQL",
            SQLBackend::SQLite => "SQLite",
            SQLBackend::PostgresSQL => "PostgresSQL",
        };
        write!(f, "{}", string)
    }
}

fn add_column_type(col: &mut ColumnDef, name: &QualifiedLabel) {
    match format!("{}", name).as_str() {
        "Int" => col.integer(),
        "TinyInt" => col.tiny_integer(),
        "Bool" => col.boolean(),
        "Float" => col.float(),
        "Time" => col.timestamp(),
        "Date" => col.date(),
        "DateTime" => col.date_time(),
        _ => col.custom(name.clone()),
    };
}
