//! Produces a valid SQL data manipulation script from a model in the theory of schemas.
use crate::{
    dbl::model::*,
    one::{Path, graph::FinGraph, graph_algorithms::toposort},
    zero::{QualifiedLabel, QualifiedName, label, name},
};
use indexmap::IndexMap;
use itertools::Itertools;
use sea_query::SchemaBuilder;
use sea_query::{
    ColumnDef, ForeignKey, ForeignKeyCreateStatement, Iden, MysqlQueryBuilder,
    PostgresQueryBuilder, SqliteQueryBuilder, Table, TableCreateStatement, prepare::Write,
};
use sqlformat::{Dialect, format};
use std::fmt;

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

    /// Consumes itself and a discrete double model to produce a SQL string.
    pub fn render(
        &self,
        model: &DiscreteDblModel,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
        mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> Result<String, String> {
        let g = model.generating_graph();
        let t = toposort(g).map_err(|e| format!("Topological sort failed: {}", e))?;
        let morphisms: IndexMap<&QualifiedName, Vec<QualifiedName>> =
            IndexMap::from_iter(t.iter().rev().filter_map(|v| {
                (name("Entity") == model.ob_generator_type(v))
                    .then_some((v, g.out_edges(v).collect::<Vec<QualifiedName>>()))
            }));

        let tables = self.make_tables(model, morphisms, ob_label, mor_label);

        let output: String = tables
            .iter()
            .map(|table| match self.backend {
                SQLBackend::MySQL => table.to_string(MysqlQueryBuilder),
                SQLBackend::SQLite => table.to_string(SqliteQueryBuilder),
                SQLBackend::PostgresSQL => table.to_string(PostgresQueryBuilder),
            })
            .join(";\n")
            + ";";

        // TODO SQL analysis should interface with this
        let formatted_output = format(
            &output,
            &sqlformat::QueryParams::None,
            &sqlformat::FormatOptions {
                lines_between_queries: 2,
                dialect: self.backend.clone().into(),
                ..Default::default()
            },
        );

        let result = match self.backend {
            SQLBackend::SQLite => ["PRAGMA foreign_keys = ON", &formatted_output].join(";\n\n"),
            _ => formatted_output,
        };
        Ok(result)
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

    fn make_tables(
        &self,
        model: &DiscreteDblModel,
        morphisms: IndexMap<&QualifiedName, Vec<QualifiedName>>,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
        mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> Vec<TableCreateStatement> {
        morphisms
            .into_iter()
            .map(|(ob, mors)| {
                let mut tbl = Table::create();

                // the targets for arrows
                let table_column_defs = mors.iter().fold(
                    tbl.table(ob_label(ob)).if_not_exists().col(
                        ColumnDef::new("id").integer().not_null().auto_increment().primary_key(),
                    ),
                    |acc, mor| {
                        let mor_name = mor_label(mor);
                        // if the Id of the name is an entity, it is assumed to be a column
                        // which references the primary key of another table.
                        if model.mor_generator_type(mor) == Path::Id(name("Entity")) {
                            acc.col(ColumnDef::new(mor_name.clone()).integer().not_null())
                        } else {
                            let tgt =
                                model.get_cod(mor).map(&ob_label).unwrap_or_else(|| label(""));
                            let mut col = ColumnDef::new(mor_name);
                            col.not_null();
                            add_column_type(&mut col, &tgt);
                            acc.col(col)
                        }
                    },
                );

                mors.iter()
                    .filter(|mor| model.mor_generator_type(mor) == Path::Id(name("Entity")))
                    .fold(
                        // TABLE AND COLUMN DEFS
                        table_column_defs,
                        |acc, mor| {
                            let tgt =
                                model.get_cod(mor).map(&ob_label).unwrap_or_else(|| label(""));
                            acc.foreign_key(&mut self.fk(ob_label(ob), tgt, mor_label(mor)))
                        },
                    )
                    .to_owned()
            })
            .collect()
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

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::{stdlib::th_schema, tt};

    #[test]
    fn sql_schema() {
        let th = Rc::new(th_schema());
        let model = tt::modelgen::parse_and_generate(
            "[
                Person : Entity,
                Dog : Entity,
                walks : (Hom Entity)[Person, Dog],
                Hair : AttrType,
                has : Attr[Person, Hair],
            ]",
            &th.into(),
        );
        let model = model.and_then(|m| m.as_discrete()).unwrap();

        let expected = expect![[
            r#"CREATE TABLE IF NOT EXISTS `Dog` (`id` int NOT NULL AUTO_INCREMENT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS `Person` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `walks` int NOT NULL,
  `has` Hair NOT NULL,
  CONSTRAINT `FK_walks_Person_Dog` FOREIGN KEY (`walks`) REFERENCES `Dog` (`id`)
);"#
        ]];
        let ddl = SQLAnalysis::new(SQLBackend::MySQL)
            .render(
                &model,
                |id| format!("{id}").as_str().into(),
                |id| format!("{id}").as_str().into(),
            )
            .expect("SQL should render");
        expected.assert_eq(&ddl);
    }
}
