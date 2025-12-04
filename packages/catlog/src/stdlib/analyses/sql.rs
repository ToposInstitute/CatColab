//! SQL
use crate::{
    dbl::model::DiscreteDblModel,
    zero::{QualifiedLabel, QualifiedName},
};
use crate::{dbl::model::*, one::FgCategory};
use crate::{
    one::Path,
    zero::{name, Namespace},
};
use itertools::Itertools;
use sea_query::SchemaBuilder;
use sea_query::{
    prepare::Write, ColumnDef, ForeignKey, ForeignKeyCreateStatement, Iden, MysqlQueryBuilder,
    PostgresQueryBuilder, SqliteQueryBuilder, Table, TableCreateStatement,
};
use std::fmt;

impl Namespace {
    fn label_name(self, name: QualifiedName) -> QualifiedLabel {
        self.label(&name.clone()).unwrap_or(QualifiedLabel::single("".into()))
    }
}

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
    obns: Namespace,
    morns: Namespace,
    backend: SqlBackend,
}

impl SQLAnalysis {
    /// Constructs a new SQLAnalysis instance
    pub fn new(obns: Namespace, morns: Namespace, backend: &str) -> Result<SQLAnalysis, String> {
        if let Ok(backend) = SqlBackend::try_from(backend) {
            Ok(SQLAnalysis {
                obns,
                morns,
                backend,
            })
        } else {
            Err(format!(
                "Backend {} is invalid. Pass `MySQL`, `SQLite`, or PostgresSQL` instead",
                backend
            ))
        }
    }

    /// Consumes itself and a discrete double model to produce a SQL string
    pub fn render(&self, model: &DiscreteDblModel) -> String {
        // hashmap of sources and their targets
        let mut morphisms = model
            .mor_generators()
            // TODO mor_with_type?
            .filter_map(|mor| Some((model.get_dom(&mor)?.clone(), mor)))
            .into_group_map();

        for obj in model.objects_with_type(&name("Entity")) {
            morphisms.entry(obj.clone()).or_insert_with(Vec::new);
        }

        let tables: Vec<TableCreateStatement> = morphisms
            .into_iter()
            .map(|(ob, mors)| {
                let mut tbl = Table::create();

                // the targets for arrows
                let table_column_defs = mors.iter().fold(
                    tbl.table(self.obns.clone().label_name(ob.clone())).if_not_exists().col(
                        ColumnDef::new("id").integer().not_null().auto_increment().primary_key(),
                    ),
                    |acc, mor| {
                        let mor_name = self.morns.clone().label_name(mor.clone());
                        // if the Id of the name is an entity, it is assumed to be a column
                        // which references the primary key of another table.
                        if model.mor_generator_type(mor) == Path::Id(name("Entity")) {
                            acc.col(ColumnDef::new(mor_name.clone()).integer().not_null())
                        } else {
                            let tgt_name = self
                                .obns
                                .clone()
                                .label_name(model.get_cod(mor).unwrap_or(&name("")).clone());
                            match format!("{}", tgt_name).as_str() {
                                "Int" => {
                                    acc.col(ColumnDef::new(mor_name.clone()).text().not_null())
                                }
                                "TinyInt" => acc.col(
                                    ColumnDef::new(mor_name.clone()).tiny_integer().not_null(),
                                ),
                                "Float" => {
                                    acc.col(ColumnDef::new(mor_name.clone()).float().not_null())
                                }
                                "Time" => {
                                    acc.col(ColumnDef::new(mor_name.clone()).timestamp().not_null())
                                }
                                "Bool" => {
                                    acc.col(ColumnDef::new(mor_name.clone()).boolean().not_null())
                                }
                                "Date" => {
                                    acc.col(ColumnDef::new(mor_name.clone()).date().not_null())
                                }
                                "DateTime" => {
                                    acc.col(ColumnDef::new(mor_name.clone()).date_time().not_null())
                                }
                                _ => acc.col(ColumnDef::new(mor_name.clone()).text().not_null()),
                            }
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
                            acc.foreign_key(&mut self.fk(ob.clone(), tgt.clone(), mor.clone()))
                        },
                    )
                    .to_owned()
            })
            .collect();

        // convert to string
        let mut output: Vec<String> = tables
            .iter()
            .map(|table| match self.backend {
                SqlBackend::MySql => table.to_string(MysqlQueryBuilder),
                SqlBackend::Sqlite => table.to_string(SqliteQueryBuilder),
                SqlBackend::Postgres => table.to_string(PostgresQueryBuilder),
            })
            .collect();

        // to ensure tests pass consistently. However, sea_query should probably allow multiple
        // tables
        output.sort();

        let output = output.join(";\n") + ";";

        match self.backend {
            SqlBackend::Sqlite => ["PRAGMA foreign_keys = ON", &output].join(";\n\n"),
            _ => output,
        }
    }

    fn fk(
        &self,
        src: QualifiedName,
        tgt: QualifiedName,
        mor: QualifiedName,
    ) -> ForeignKeyCreateStatement {
        let src_name = self.obns.clone().label_name(src);
        let tgt_name = self.obns.clone().label_name(tgt);
        let mapping_name = self.morns.clone().label_name(mor);
        ForeignKey::create()
            .name(format!("FK_{}_{}_{}", mapping_name, src_name, tgt_name))
            .from(src_name.clone(), mapping_name)
            .to(tgt_name.clone(), "id")
            .to_owned()
    }
}

/// Variants of SQL backends. Each correspond to types which implement the
/// `SchemaBuilder` trait that is used to render into the correct backend. The `SchemaBuilder` and
/// the types implementing that trait are owned by `sea_query`.
#[derive(Debug, Clone)]
pub enum SqlBackend {
    /// The MySQL backend
    MySql,

    /// The SQLite3 backend
    Sqlite,

    /// The Postgres backend
    Postgres,
}

impl SqlBackend {
    /// Produces a boxed implementation of the SchemaBuilder trait
    pub fn as_type(&self) -> Box<dyn SchemaBuilder> {
        match self {
            SqlBackend::MySql => Box::new(MysqlQueryBuilder),
            SqlBackend::Sqlite => Box::new(SqliteQueryBuilder),
            SqlBackend::Postgres => Box::new(PostgresQueryBuilder),
        }
    }
}

impl TryFrom<&str> for SqlBackend {
    type Error = String;
    fn try_from(backend: &str) -> Result<Self, Self::Error> {
        match backend {
            "MySQL" => Ok(SqlBackend::MySql),
            "SQLite" => Ok(SqlBackend::Sqlite),
            "PostgresSQL" => Ok(SqlBackend::Postgres),
            _ => Err(String::from("Invalid backend")),
        }
    }
}

impl fmt::Display for SqlBackend {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let string = match self {
            SqlBackend::MySql => "MySQL",
            SqlBackend::Sqlite => "SQLite",
            SqlBackend::Postgres => "PostgresSQL",
        };
        write!(f, "{}", string)
    }
}

#[cfg(test)]
mod tests {

    use super::*;
    use crate::dbl::{model::*, theory::DiscreteDblTheory};
    use crate::stdlib::th_schema;
    use crate::tt::{
        batch::PARSE_CONFIG,
        modelgen::generate,
        text_elab::Elaborator,
        toplevel::{std_theories, Theory, Toplevel},
    };
    use crate::validate::Validate;
    use crate::zero::{name, Namespace};
    use std::rc::Rc;
    use tattle::Reporter;

    impl DiscreteDblModel {
        /// Make a model of the theory of schema from a string
        fn parse(th_: Rc<DiscreteDblTheory>, s: &str) -> DiscreteDblModel {
            let th = Theory::new("".into(), th_.clone());

            let reporter = Reporter::new();
            let toplevel = Toplevel::new(std_theories());

            if let Some(model) = PARSE_CONFIG.with_parsed(s, reporter.clone(), |n| {
                let mut elaborator = Elaborator::new(th.clone(), reporter.clone(), &toplevel);
                let (_, ty_v) = elaborator.ty(n);
                let (model, _) = generate(&toplevel, &th, &ty_v);
                Some(model)
            }) {
                model
            } else {
                DiscreteDblModel::new(th_)
            }
        }
    }

    #[test]
    fn sql() {
        let mut model = DiscreteDblModel::parse(
            Rc::new(th_schema()),
            "[
                Person : Entity,
                Dog : Entity,
                walks : (Id Entity)[Person, Dog],
                Hair : AttrType,
                has : (Attr)[Person, Hair],
            ]",
        );
        // Since we are constructing the model from human-readable names and not UUIDs, we don't
        // need to lookup the human-readable name from these namespaces. They're just to pass into
        // the function.
        let mut obns = Namespace::new_for_text();
        let mut morns = Namespace::new_for_text();

        let raw_creates = vec![
            r"CREATE TABLE IF NOT EXISTS `Dog` ( `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY )",
            r"CREATE TABLE IF NOT EXISTS `Person` ( `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY, `walks` int NOT NULL, `has` text NOT NULL, CONSTRAINT `FK_walks_Person_Dog` FOREIGN KEY (`walks`) REFERENCES `Dog` (`id`) )",
        ];

        let ddl = SQLAnalysis::new(obns, morns, "MySQL").expect("!").render(&model);

        // TODO Hash is nondeterministic
        assert_eq!(ddl, raw_creates.join(";\n") + ";");
    }
}
