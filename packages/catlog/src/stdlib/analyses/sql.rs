//! Produces a valid SQL data manipulation script from a model in the theory of schemas.
use crate::{
    dbl::model::*,
    one::{FgCategory, Path},
    zero::{QualifiedLabel, QualifiedName, name},
};
use itertools::Itertools;
use sea_query::SchemaBuilder;
use sea_query::{
    ColumnDef, ForeignKey, ForeignKeyCreateStatement, Iden, MysqlQueryBuilder,
    PostgresQueryBuilder, SqliteQueryBuilder, Table, TableCreateStatement, prepare::Write,
};
use sqlformat::{Dialect, format};
use std::{collections::HashMap, fmt};

impl Iden for QualifiedName {
    fn unquoted(&self, s: &mut dyn Write) {
        ToString::to_string(&name(self.clone())).as_str().unquoted(s)
    }
}

impl Iden for QualifiedLabel {
    fn unquoted(&self, s: &mut dyn Write) {
        ToString::to_string(&self.clone()).as_str().unquoted(s)
    }
}

impl From<QualifiedLabel> for TableCreateStatement {
    fn from(label: QualifiedLabel) -> Self {
        Table::create()
            .table(label)
            .if_not_exists()
            .col(ColumnDef::new("id").integer().not_null().auto_increment().primary_key())
            .to_owned()
    }
}

/// Struct for building a valid SQL DDL
pub struct SQLAnalysis {
    backend: SqlBackend,
}

impl SQLAnalysis {
    /// Constructs a new SQLAnalysis instance
    pub fn new(backend: SqlBackend) -> Self {
        Self { backend }
    }

    /// Consumes itself and a discrete double model to produce a SQL string
    pub fn render(
        &self,
        model: &DiscreteDblModel,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
        mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> String {
        let mut morphisms = model
            .mor_generators()
            .filter_map(|mor| Some((model.get_dom(&mor)?.clone(), mor)))
            .into_group_map();

        for obj in model.objects_with_type(&name("Entity")) {
            morphisms.entry(obj.clone()).or_insert_with(Vec::new);
        }

        let tables = self.make_tables(model, morphisms, ob_label, mor_label);

        // convert to string
        let mut output: Vec<String> = tables
            .iter()
            .map(|table| match self.backend {
                SqlBackend::MySQL => table.to_string(MysqlQueryBuilder),
                SqlBackend::SQLite => table.to_string(SqliteQueryBuilder),
                SqlBackend::PostgresSQL => table.to_string(PostgresQueryBuilder),
            })
            .collect();

        // to ensure tests pass consistently. However, sea_query should probably allow multiple
        // tables
        output.sort();
        let output = output.join(";\n") + ";";

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
            SqlBackend::SQLite => ["PRAGMA foreign_keys = ON", &formatted_output].join(";\n\n"),
            _ => formatted_output,
        }
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
        morphisms: HashMap<QualifiedName, Vec<QualifiedName>>,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
        mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> Vec<TableCreateStatement> {
        morphisms
            .into_iter()
            .map(|(ob, mors)| {
                let mut tbl = Table::create();

                // the targets for arrows
                let table_column_defs = mors.iter().fold(
                    tbl.table(ob_label(&ob)).if_not_exists().col(
                        ColumnDef::new("id").integer().not_null().auto_increment().primary_key(),
                    ),
                    |acc, mor| {
                        let mor_name = mor_label(mor);
                        // if the Id of the name is an entity, it is assumed to be a column
                        // which references the primary key of another table.
                        if model.mor_generator_type(mor) == Path::Id(name("Entity")) {
                            acc.col(ColumnDef::new(mor_name.clone()).integer().not_null())
                        } else {
                            let tgt_name =
                                ob_label(&model.get_cod(mor).unwrap_or(&name("")).clone());

                            let mut col_def = ColumnDef::new(mor_name.clone());
                            col_def.not_null();
                            match format!("{}", tgt_name.clone()).as_str() {
                                "Int" => col_def.integer(),
                                "TinyInt" => col_def.tiny_integer(),
                                "Bool" => col_def.boolean(),
                                "Float" => col_def.float(),
                                "Time" => col_def.timestamp(),
                                "Date" => col_def.date(),
                                "DateTime" => col_def.date_time(),
                                _ => col_def.custom(tgt_name),
                            };

                            acc.col(col_def)
                        }
                    },
                );

                mors.iter()
                    .filter(|mor| model.mor_generator_type(mor) == Path::Id(name("Entity")))
                    .fold(
                        // TABLE AND COLUMN DEFS
                        table_column_defs,
                        |acc, mor| {
                            let tgt = model.get_cod(mor).unwrap(); // TODO
                            let src_name = ob_label(&ob);
                            let tgt_name = ob_label(tgt);
                            let mor_name = mor_label(mor);
                            acc.foreign_key(&mut self.fk(src_name, tgt_name, mor_name))
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
pub enum SqlBackend {
    /// The MySQL backend
    MySQL,

    /// The SQLite3 backend
    SQLite,

    /// The Postgres backend
    PostgresSQL,
}

impl SqlBackend {
    /// Produces a boxed implementation of the SchemaBuilder trait
    pub fn as_type(&self) -> Box<dyn SchemaBuilder> {
        match self {
            SqlBackend::MySQL => Box::new(MysqlQueryBuilder),
            SqlBackend::SQLite => Box::new(SqliteQueryBuilder),
            SqlBackend::PostgresSQL => Box::new(PostgresQueryBuilder),
        }
    }
}

impl From<SqlBackend> for Dialect {
    fn from(backend: SqlBackend) -> sqlformat::Dialect {
        match backend {
            SqlBackend::PostgresSQL => Dialect::PostgreSql,
            _ => Dialect::Generic,
        }
    }
}

impl TryFrom<&str> for SqlBackend {
    type Error = String;
    fn try_from(backend: &str) -> Result<Self, Self::Error> {
        match backend {
            "MySQL" => Ok(SqlBackend::MySQL),
            "SQLite" => Ok(SqlBackend::SQLite),
            "PostgresSQL" => Ok(SqlBackend::PostgresSQL),
            _ => Err(String::from("Invalid backend")),
        }
    }
}

impl fmt::Display for SqlBackend {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let string = match self {
            SqlBackend::MySQL => "MySQL",
            SqlBackend::SQLite => "SQLite",
            SqlBackend::PostgresSQL => "PostgresSQL",
        };
        write!(f, "{}", string)
    }
}

#[cfg(test)]
mod tests {

    use super::*;
    use crate::{stdlib::th_schema, tt, zero::Namespace};
    use std::rc::Rc;

    #[test]
    fn sql() {
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

        let raw_creates = [
            "CREATE TABLE IF NOT EXISTS `Dog` (`id` int NOT NULL AUTO_INCREMENT PRIMARY KEY)",
            "CREATE TABLE IF NOT EXISTS `Person` (\n  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,\n  `walks` int NOT NULL,\n  `has` Hair NOT NULL,\n  CONSTRAINT `FK_walks_Person_Dog` FOREIGN KEY (`walks`) REFERENCES `Dog` (`id`)\n)",
        ];

        let obns = Namespace::new_for_text();
        let morns = Namespace::new_for_text();

        if let Some(m) = &model.and_then(|m| m.as_discrete()) {
            let ddl = SQLAnalysis::new(SqlBackend::MySQL).render(
                m,
                |id| obns.label(id).unwrap_or(QualifiedLabel::single("".into())),
                |id| morns.label(id).unwrap_or(QualifiedLabel::single("".into())),
            );

            // TODO Hash is nondeterministic
            assert_eq!(ddl, raw_creates.join(";\n\n") + ";");
        }
    }
}
