//! Produces a valid SQL data manipulation script from a model in the theory of schemas.
use crate::{
    dbl::model::*,
    one::{
        Path,
        graph::FinGraph,
        graph_algorithms::{ToposortData, toposort_lenient, toposort_strict},
    },
    zero::{QualifiedLabel, QualifiedName, name},
};
use indexmap::IndexMap;
use itertools::Itertools;
use nonempty::nonempty;
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

#[derive(Debug, Clone)]
enum ColumnBehavior {
    Ordinary { mor: QualifiedName, tgt: QualifiedName },
    Deferrable { mor: QualifiedName, tgt: QualifiedName },
    Attribute { mor: QualifiedName, tgt: QualifiedName },
}

impl ColumnBehavior {
    // TODO pass model into here
    fn build(
        model: &DiscreteDblModel,
        cycles: &IndexMap<QualifiedName, Vec<QualifiedName>>,
        src: &QualifiedName,
        mor: QualifiedName,
    ) -> Self {
        let tgt = model.get_cod(&mor).unwrap();
        match model.mor_generator_type(&mor) {
            t if t == Path::Seq(nonempty![name("Attr")]) => {
                ColumnBehavior::Attribute { mor, tgt: tgt.clone() }
            }
            _ => {
                if cycles.contains_key(src) || cycles.contains_key(&tgt.clone()) {
                    ColumnBehavior::Deferrable { mor, tgt: tgt.clone() }
                } else {
                    ColumnBehavior::Ordinary { mor, tgt: tgt.clone() }
                }
            }
        }
    }

    fn mor(&self) -> &QualifiedName {
        match self {
            ColumnBehavior::Ordinary { mor, tgt: _ }
            | ColumnBehavior::Deferrable { mor, tgt: _ }
            | ColumnBehavior::Attribute { mor, tgt: _ } => mor,
        }
    }

    fn tgt(&self) -> &QualifiedName {
        match self {
            ColumnBehavior::Ordinary { mor: _, tgt }
            | ColumnBehavior::Deferrable { mor: _, tgt }
            | ColumnBehavior::Attribute { mor: _, tgt } => tgt,
        }
    }

    fn render_postgres_fk(
        &self,
        src: &QualifiedName,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
        mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> String {
        let fk = |src: &QualifiedLabel, mor: &QualifiedLabel, tgt: &QualifiedLabel| -> String {
            format!(
                r#"ALTER TABLE {src}
	ADD CONSTRAINT fk_{mor}_{src}_{tgt}
	FOREIGN KEY ({mor}) REFERENCES {tgt} (id)"#
            )
        };
        match self {
            ColumnBehavior::Ordinary { mor, tgt } => {
                fk(&ob_label(src), &mor_label(mor), &ob_label(tgt)) + ";"
            }
            ColumnBehavior::Deferrable { mor, tgt } => {
                fk(&ob_label(src), &mor_label(mor), &ob_label(tgt))
                    + "\n"
                    + r#"DEFERRABLE INITIALLY DEFERRED;"#
            }
            ColumnBehavior::Attribute { mor: _, tgt: _ } => "".to_string(), // TODO
        }
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

    // TODO consume input from analysis
    /// Returns formatted output.
    pub fn format(&self, output: &str) -> String {
        format(
            output,
            &sqlformat::QueryParams::None,
            &sqlformat::FormatOptions {
                lines_between_queries: 2,
                dialect: self.backend.clone().into(),
                ..Default::default()
            },
        )
    }

    /// Builds table statements into valid SQL DML.
    fn build(
        &self,
        tables: Vec<TableCreateStatement>,
        morphisms: IndexMap<QualifiedName, Vec<ColumnBehavior>>,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
        mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> String {
        let table_def: String = tables
            .iter()
            .map(|table| match self.backend {
                SQLBackend::MySQL => table.to_string(MysqlQueryBuilder),
                SQLBackend::SQLite => table.to_string(SqliteQueryBuilder),
                SQLBackend::PostgresSQL => table.to_string(PostgresQueryBuilder),
            })
            .join(";\n")
            + ";";

        let deferrable_fks: String = morphisms
            .iter()
            .flat_map(|(ob, mors)| {
                mors.iter()
                    .filter(|fkb| matches!(fkb, ColumnBehavior::Deferrable { mor: _, tgt: _ }))
                    .map(|fkb| fkb.render_postgres_fk(ob, &ob_label, &mor_label))
                    .collect::<Vec<_>>()
            })
            .join("\n");

        table_def + &deferrable_fks
    }

    fn toposort_morphisms(
        &self,
        model: &DiscreteDblModel,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> Result<IndexMap<QualifiedName, Vec<ColumnBehavior>>, String> {
        let g = model.generating_graph();
        let toposort: ToposortData<_> = match self.backend {
            SQLBackend::PostgresSQL => {
                toposort_lenient(g).map_err(|e| format!("Topological sort failed: {}", e))
            }
            _ => toposort_strict(g).map_err(|e| {
                format!(
                    "Topological sort failed: {}",
                    match e {
                        crate::one::graph_algorithms::ToposortError::CycleError(v) => ob_label(&v),
                        crate::one::graph_algorithms::ToposortError::SelfLoop(v) => ob_label(&v),
                    }
                )
            }),
        }?;

        let cycles = toposort.cycles;
        // if a morphism is a key in toposort.cycles, then its source and targets are deferrable.
        let morphisms: IndexMap<QualifiedName, Vec<ColumnBehavior>> =
            IndexMap::from_iter(toposort.stack.into_iter().rev().filter_map(|v| {
                (name("Entity") == model.ob_generator_type(&v)).then_some((
                    v.clone(),
                    g.out_edges(&v)
                        .map(|e| ColumnBehavior::build(model, &cycles, &v, e))
                        .collect::<Vec<ColumnBehavior>>(),
                ))
            }));
        Ok(morphisms)
    }

    /// Consumes itself and a discrete double model to produce a SQL string.
    pub fn render(
        &self,
        model: &DiscreteDblModel,
        ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
        mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    ) -> Result<String, String> {
        let morphisms = self.toposort_morphisms(model, &ob_label);
        let tables = self.make_tables(model, morphisms.clone()?, &ob_label, &mor_label);
        let output: String = self.build(tables, morphisms?, ob_label, mor_label);
        let formatted_output = self.format(&output);
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
        morphisms: IndexMap<QualifiedName, Vec<ColumnBehavior>>,
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
                        let mor_name = mor_label(mor.mor());
                        // if the Id of the name is an entity, it is assumed to be a column
                        // which references the primary key of another table.
                        if model.mor_generator_type(mor.mor()) == Path::Id(name("Entity")) {
                            acc.col(ColumnDef::new(mor_name.clone()).integer().not_null())
                        } else {
                            let mut col = ColumnDef::new(mor_name);
                            col.not_null();
                            add_column_type(&mut col, &ob_label(mor.tgt()));
                            acc.col(col)
                        }
                    },
                );

                mors.iter()
                    .filter(|mor| {
                        (model.mor_generator_type(mor.mor()) == Path::Id(name("Entity")))
                            && (if self.backend == SQLBackend::PostgresSQL {
                                matches!(mor, ColumnBehavior::Ordinary { mor: _, tgt: _ })
                            } else {
                                true
                            })
                    })
                    .fold(
                        // TABLE AND COLUMN DEFS
                        table_column_defs,
                        |acc, mor| {
                            // TODO if there is a cyclic pattern, we want to add deferrable...
                            acc.foreign_key(&mut self.fk(
                                ob_label(&ob),
                                ob_label(mor.tgt()),
                                mor_label(mor.mor()),
                            ))
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
#[derive(Debug, Clone, PartialEq)]
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

fn add_column_type(col: &mut ColumnDef, label: &QualifiedLabel) {
    match format!("{label}").as_str() {
        "Int" => col.integer(),
        "TinyInt" => col.tiny_integer(),
        "Bool" => col.boolean(),
        "Float" => col.float(),
        "Time" => col.timestamp(),
        "Date" => col.date(),
        "DateTime" => col.date_time(),
        _ => col.custom(label.clone()),
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
        let source = "[
                Person : Entity,
                Dog : Entity,
                walks : (Hom Entity)[Person, Dog],
                Hair : AttrType,
                has : Attr[Person, Hair],
            ]";
        let model = tt::modelgen::Model::from_text(&th.clone().into(), source)
            .and_then(|m| m.as_discrete())
            .unwrap();

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

    #[test]
    fn sql_cycles() {
        let th = Rc::new(th_schema());
        let source = "[
                Refs : Entity,
                Snapshots : Entity,
                head : (Hom Entity)[Refs, Snapshots],
                for_ref: (Hom Entity)[Snapshots, Refs],
                Timestamp : AttrType,
                created : Attr[Refs, Timestamp],
                last_updated: Attr[Snapshots, Timestamp],
            ]";
        let model = tt::modelgen::Model::from_text(&th.into(), source)
            .and_then(|m| m.as_discrete())
            .unwrap();

        let expected = expect![[r#"CREATE TABLE IF NOT EXISTS "Snapshots" (
  "id" serial NOT NULL PRIMARY KEY,
  "for_ref" integer NOT NULL,
  "last_updated" Timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "Refs" (
  "id" serial NOT NULL PRIMARY KEY,
  "head" integer NOT NULL,
  "created" Timestamp NOT NULL
);

ALTER TABLE
  Snapshots
ADD
  CONSTRAINT fk_for_ref_Snapshots_Refs FOREIGN KEY (for_ref) REFERENCES Refs (id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE
  Refs
ADD
  CONSTRAINT fk_head_Refs_Snapshots FOREIGN KEY (head) REFERENCES Snapshots (id) DEFERRABLE INITIALLY DEFERRED;"#]];
        let ddl = SQLAnalysis::new(SQLBackend::PostgresSQL)
            .render(
                &model,
                |id| format!("{id}").as_str().into(),
                |id| format!("{id}").as_str().into(),
            )
            .expect("SQL should render");
        expected.assert_eq(&ddl);
    }
}
