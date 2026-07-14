//! Produces a valid SQL data manipulation script from a model in the theory of schemas.
use crate::{
    dbl::model::*,
    one::{
        FgCategory, Path,
        graph::FinGraph,
        graph_algorithms::{ToposortData, toposort_lenient},
    },
    validate::Validate,
    zero::{QualifiedLabel, QualifiedName, name},
};
use derive_more::Constructor;
use indexmap::IndexMap;
use itertools::Itertools;
use nonempty::nonempty;
use sea_query::SchemaBuilder;
use sea_query::{
    Alias, ColumnDef, ForeignKey, ForeignKeyCreateStatement, Iden, MysqlQueryBuilder,
    PostgresQueryBuilder, SqliteQueryBuilder, Table, TableCreateStatement, prepare::Write,
};
use sqlformat::{Dialect, format};
use sqlparser::{dialect::GenericDialect, parser};
use std::fmt;

const PRIMARY_KEY_NAME: &str = "id";

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

/// Enum for specifying the behavior of a column. For example, an Ordinary column is simply
/// a foreign key constraint.
#[derive(Debug, Clone, PartialEq)]
pub enum ColumnType {
    /// A foreign key constraint. The target is an entity.
    Ordinary {
        /// The name of the morphism.
        mor: QualifiedName,
        /// The name of the target entity.
        tgt: QualifiedName,
    },
    /// A deferrable key constraint. The target is an entity.
    Deferrable {
        /// The name of the morphism.
        mor: QualifiedName,
        /// The name of the target entity.
        tgt: QualifiedName,
    },
    /// An attribute column. The target is an attribute type.
    Attribute {
        /// The name of the morphism.
        mor: QualifiedName,
        /// The name of the target attribute.
        tgt: QualifiedName,
    },
}

impl ColumnType {
    fn build(
        model: &DiscreteDblModel,
        cycles: &IndexMap<QualifiedName, Vec<QualifiedName>>,
        src: &QualifiedName,
        mor: QualifiedName,
    ) -> Self {
        let tgt = model.get_cod(&mor).unwrap();
        match model.mor_generator_type(&mor) {
            t if t == Path::Seq(nonempty![name("Attr")]) => {
                ColumnType::Attribute { mor, tgt: tgt.clone() }
            }
            _ => {
                if cycles.contains_key(src) || cycles.contains_key(&tgt.clone()) {
                    ColumnType::Deferrable { mor, tgt: tgt.clone() }
                } else {
                    ColumnType::Ordinary { mor, tgt: tgt.clone() }
                }
            }
        }
    }

    fn mor(&self) -> &QualifiedName {
        match self {
            ColumnType::Ordinary { mor, tgt: _ }
            | ColumnType::Deferrable { mor, tgt: _ }
            | ColumnType::Attribute { mor, tgt: _ } => mor,
        }
    }

    fn tgt(&self) -> &QualifiedName {
        match self {
            ColumnType::Ordinary { mor: _, tgt }
            | ColumnType::Deferrable { mor: _, tgt }
            | ColumnType::Attribute { mor: _, tgt } => tgt,
        }
    }

    /// The function creates foreign key constraints for PostgresSQL. Here, deferrable key
    /// constraints are special.
    fn render_postgres_fk(
        &self,
        src: &QualifiedName,
        ob_label: impl Fn(&QualifiedName) -> String,
        mor_label: impl Fn(&QualifiedName) -> String,
    ) -> String {
        let fk = |src: String, mor: &String, tgt: &String| -> String {
            format!(
                r#"ALTER TABLE "{src}"
	ADD CONSTRAINT fk_{mor}_{src}_{tgt}
	FOREIGN KEY ({mor}) REFERENCES "{tgt}" (id)"#
            )
        };
        match self {
            ColumnType::Ordinary { mor, tgt } => {
                fk(ob_label(src), &mor_label(mor), &ob_label(tgt)) + ";"
            }
            ColumnType::Deferrable { mor, tgt } => {
                fk(ob_label(src), &mor_label(mor), &ob_label(tgt))
                    + "\n"
                    + r#"DEFERRABLE INITIALLY DEFERRED;"#
            }
            // this is unreachable, since attributes cannot be foreign keys.
            ColumnType::Attribute { mor: _, tgt: _ } => unreachable!(),
        }
    }
}

/// Data containing foreign key constraints and their behavior, which are interpreted as
/// backend-specific attributes.
#[derive(Clone, Debug)]
pub struct ForeignKeyConstraints {
    /// Foreign key constraints for every table.
    fks: IndexMap<QualifiedName, Vec<ColumnType>>,
}

impl ForeignKeyConstraints {
    fn new(model: &DiscreteDblModel) -> Self {
        let g = model.generating_graph();
        let toposort: ToposortData<QualifiedName> = toposort_lenient(g);
        let cycles = toposort.cycles;
        let fks = IndexMap::from_iter(toposort.stack.into_iter().rev().filter_map(|v| {
            (name("Entity") == model.ob_generator_type(&v)).then_some((
                v.clone(),
                g.out_edges(&v)
                    .map(|e| ColumnType::build(model, &cycles, &v, e))
                    .collect::<Vec<ColumnType>>(),
            ))
        }));
        Self { fks }
    }

    fn any_deferrable(&self) -> bool {
        self.fks
            .values()
            .flatten()
            .into_iter()
            .any(|s| matches!(s, ColumnType::Deferrable { mor: _, tgt: _ }))
    }
}

/// Error thrown when the SQL Analysis fails.
#[derive(Clone, Debug, PartialEq)]
pub enum SQLAnalysisError {
    /// Its possible that a SQL backend cannot support cyclic foreign key constraints.
    CyclicForeignKeyError {
        /// The SQL backend that fails. Of the supported SQL backends, MySQL is the only one which
        /// does not support cyclic foreign key constraints.
        backend: SQLBackend,
        /// The tables which have failing foreign key constraints.
        cycles: Vec<(QualifiedName, ColumnType)>,
    },
    /// There is a duplicate column on a table.
    DuplicateColumnError {
        /// The table with the duplicate column.
        table: QualifiedName,
        /// The duplicate column.
        column: QualifiedName,
    },
    /// Miscellaneous SQL parsing errors.
    SQLParsingError(String),
}

impl std::fmt::Display for SQLAnalysisError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SQLAnalysisError::CyclicForeignKeyError { backend, cycles } => write!(
                f,
                "Cycle detected at tables {:#?}. {backend} cannot support cyclic foreign keys.",
                cycles
            ),
            SQLAnalysisError::DuplicateColumnError { table, column } => {
                write!(f, "Duplicate column {column} found on {table}")
            }
            SQLAnalysisError::SQLParsingError(err) => write!(f, "{err}"),
        }
    }
}

/// Struct for building a valid SQL DDL.
#[derive(Constructor)]
pub struct SQLAnalysis {
    backend: SQLBackend,
}

type SQLAnalysisResult = Result<String, nonempty::NonEmpty<SQLAnalysisError>>;

impl SQLAnalysis {
    /// Consumes itself and a discrete double model to produce a SQL string.
    pub fn execute(
        &self,
        model: &DiscreteDblModel,
        ob_label: impl Fn(&QualifiedName) -> String,
        mor_label: impl Fn(&QualifiedName) -> String,
        // SQLAnalysisOutput has the output of the execution as well as warnings
    ) -> SQLAnalysisResult {
        let mut errors: Vec<SQLAnalysisError> = self.pre_validate(model, &mor_label);

        let constraints = match self.toposort_morphisms(model) {
            Ok(x) => x,
            Err(e) => {
                errors.push(e);
                return Err(nonempty::NonEmpty::from_vec(errors).unwrap());
            }
        };

        let tables = self.make_tables(model, constraints.clone(), &ob_label, &mor_label);
        let output: String = self.build(tables, constraints.clone(), ob_label, mor_label);
        let formatted_output = self.format(&output);
        // pragmas
        let result = match self.backend {
            SQLBackend::SQLite => ["PRAGMA foreign_keys = ON", &formatted_output].join(";\n\n"),
            _ => formatted_output,
        };

        match SQLAnalysisResult::Ok(result.clone()).validate() {
            Ok(_) => Ok(result),
            Err(nonempty::NonEmpty { head: e, tail: _ }) => {
                errors.push(e);
                Err(nonempty::NonEmpty::from_vec(errors).unwrap())
            }
        }
    }

    /// Validates the model before execute the analysis. Useful for checking things such as a duplicate foreign keys.
    fn pre_validate(
        &self,
        model: &DiscreteDblModel,
        mor_label: impl Fn(&QualifiedName) -> String,
    ) -> Vec<SQLAnalysisError> {
        self.validate_duplicate_foreign_keys(model, &mor_label)
    }
}

impl SQLAnalysis {
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

    /// Validates duplicate foreign keys
    pub fn validate_duplicate_foreign_keys(
        &self,
        model: &DiscreteDblModel,
        mor_label: impl Fn(&QualifiedName) -> String,
    ) -> Vec<SQLAnalysisError> {
        model
            .mor_generators()
            .filter_map(|mor| {
                (&mor_label(&mor) == PRIMARY_KEY_NAME).then_some({
                    Some(SQLAnalysisError::DuplicateColumnError {
                        table: model.get_dom(&mor).unwrap().clone(),
                        column: mor,
                    })
                })
            })
            .collect::<Option<Vec<SQLAnalysisError>>>()
            .unwrap()
    }

    /// Builds table statements into valid SQL DML.
    fn build(
        &self,
        tables: Vec<TableCreateStatement>,
        constraints: ForeignKeyConstraints,
        ob_label: impl Fn(&QualifiedName) -> String,
        mor_label: impl Fn(&QualifiedName) -> String,
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

        // for PostgresSQL only
        let deferrable_fks: String = constraints
            .fks
            .iter()
            .flat_map(|(ob, mors)| {
                mors.iter()
                    .filter(|fkb| matches!(fkb, ColumnType::Deferrable { mor: _, tgt: _ }))
                    .map(|fkb| fkb.render_postgres_fk(ob, &ob_label, &mor_label))
                    .collect::<Vec<String>>()
            })
            .join("\n");

        table_def + &deferrable_fks
    }

    fn validate_toposort(
        &self,
        constraints: ForeignKeyConstraints,
    ) -> Result<ForeignKeyConstraints, SQLAnalysisError> {
        // TODO: punting fixing SQLite cycles for now
        if (self.backend == SQLBackend::MySQL || self.backend == SQLBackend::SQLite)
            && constraints.any_deferrable()
        {
            let cycles = constraints
                .fks
                .into_iter()
                .flat_map(|(k, v)| v.into_iter().map(move |e| (k.clone(), e)))
                .filter(|(_, e)| matches!(e, ColumnType::Deferrable { mor: _, tgt: _ }))
                .collect::<Vec<_>>();
            Err(SQLAnalysisError::CyclicForeignKeyError { backend: self.backend.clone(), cycles })
        } else {
            Ok(constraints)
        }
    }

    fn toposort_morphisms(
        &self,
        model: &DiscreteDblModel,
    ) -> Result<ForeignKeyConstraints, SQLAnalysisError> {
        // if a morphism is a key in toposort.cycles, then its source and targets are deferrable.
        let constraints = ForeignKeyConstraints::new(model);
        self.validate_toposort(constraints)
    }

    fn fk(&self, src: &str, tgt: &str, mor: &str) -> ForeignKeyCreateStatement {
        ForeignKey::create()
            .name(format!("FK_{}_{}_{}", mor, src, tgt))
            .from(Alias::new(src), Alias::new(mor))
            .to(Alias::new(tgt), PRIMARY_KEY_NAME)
            .to_owned()
    }

    fn make_tables(
        &self,
        model: &DiscreteDblModel,
        constraints: ForeignKeyConstraints,
        ob_label: impl Fn(&QualifiedName) -> String,
        mor_label: impl Fn(&QualifiedName) -> String,
    ) -> Vec<TableCreateStatement> {
        constraints
            .fks
            .into_iter()
            .map(|(ob, mors)| {
                let mut tbl = Table::create();

                // the targets for arrows
                let table_column_defs = mors.iter().fold(
                    tbl.table(Alias::new(ob_label(&ob))).if_not_exists().col(
                        ColumnDef::new(PRIMARY_KEY_NAME)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    ),
                    |acc, mor| {
                        let mor_tgt = mor.tgt();
                        let ob_name = ob_label(mor_tgt);
                        let mor_name = mor_label(mor.mor());
                        // if the Id of the name is an entity, it is assumed to be a column
                        // which references the primary key of another table.
                        if model.mor_generator_type(mor.mor()) == Path::Id(name("Entity")) {
                            acc.col(
                                ColumnDef::new(Alias::new(mor_name.as_str())).integer().not_null(),
                            )
                        } else {
                            let mut col = ColumnDef::new(Alias::new(mor_name.as_str()));
                            col.not_null();
                            add_column_type(&mut col, ob_name.as_str());
                            acc.col(col)
                        }
                    },
                );

                mors.iter()
                    .filter(|mor| {
                        (model.mor_generator_type(mor.mor()) == Path::Id(name("Entity")))
                            && (if self.backend == SQLBackend::PostgresSQL {
                                matches!(mor, ColumnType::Ordinary { mor: _, tgt: _ })
                            } else {
                                true
                            })
                    })
                    .fold(
                        // TABLE AND COLUMN DEFS
                        table_column_defs,
                        |acc, mor| {
                            // if there is a cyclic pattern, we want to add deferrable...
                            acc.foreign_key(&mut self.fk(
                                ob_label(&ob).as_str(),
                                ob_label(mor.tgt()).as_str(),
                                mor_label(mor.mor()).as_str(),
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
        write!(f, "{string}")
    }
}

fn add_column_type(col: &mut ColumnDef, label: &str) {
    match label {
        "Int" => col.integer(),
        "TinyInt" => col.tiny_integer(),
        "Bool" => col.boolean(),
        "Float" => col.float(),
        "Time" => col.timestamp(),
        "Date" => col.date(),
        "DateTime" => col.date_time(),
        _ => col.custom(Alias::new(label)),
    };
}

impl Validate for SQLAnalysisResult {
    type ValidationError = SQLAnalysisError;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        self.clone().and_then(|result| {
            match parser::Parser::parse_sql(&GenericDialect {}, &result) {
                Ok(_) => Ok(()),
                Err(e) => Err(nonempty![SQLAnalysisError::SQLParsingError(format!("{e}"))]),
            }
        })
    }
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
            .ok()
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
            .execute(
                &model,
                |id| format!("{id}").as_str().into(),
                |id| format!("{id}").as_str().into(),
            )
            .expect("SQL should render");
        expected.assert_eq(&ddl);
    }

    #[test]
    fn sql_schema_duplicate_columns() {
        let th = Rc::new(th_schema());
        let source = "[
                Person : Entity,
                Dog : Entity,
                walks : (Hom Entity)[Person, Dog],
                hair : AttrType,
                name: AttrType,
                id : Attr[Person, hair],
                has : Attr[Person, name],
            ]";
        let model = tt::modelgen::Model::from_text(&th.clone().into(), source)
            .ok()
            .and_then(|m| m.as_discrete())
            .unwrap();

        let expected = vec![SQLAnalysisError::DuplicateColumnError {
            table: name("Person"),
            column: name("id"),
        }];
        let errors = SQLAnalysis::new(SQLBackend::MySQL)
            .pre_validate(&model, |id| format!("{id}").as_str().into());
        assert_eq!(&expected, &errors);
    }

    #[test]
    fn sql_schema_bad_characters() {
        let th = Rc::new(th_schema());
        let source = "[
                Person : Entity,
                Dog : Entity,
                walks : (Hom Entity)[Person, Dog],
                | : AttrType,
                has : Attr[Person, |],
            ]";
        let model = tt::modelgen::Model::from_text(&th.clone().into(), source)
            .ok()
            .and_then(|m| m.as_discrete())
            .unwrap();

        let result = SQLAnalysis::new(SQLBackend::MySQL).execute(
            &model,
            |id| format!("{id}").as_str().into(),
            |id| format!("{id}").as_str().into(),
        );
        let validation = result.validate();

        let expected: Result<(), nonempty::NonEmpty<SQLAnalysisError>> =
            Err(nonempty![SQLAnalysisError::SQLParsingError(
                "sql parser error: Expected: a data type name, found: | at Line: 6, Column: 9"
                    .into()
            )]);
        assert_eq!(&expected, &validation);
    }

    #[test]
    fn sql_postgres_cycles() {
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
            .ok()
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
  "Snapshots"
ADD
  CONSTRAINT fk_for_ref_Snapshots_Refs FOREIGN KEY (for_ref) REFERENCES "Refs" (id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE
  "Refs"
ADD
  CONSTRAINT fk_head_Refs_Snapshots FOREIGN KEY (head) REFERENCES "Snapshots" (id) DEFERRABLE INITIALLY DEFERRED;"#]];
        let ddl = SQLAnalysis::new(SQLBackend::PostgresSQL)
            .execute(
                &model,
                |id| format!("{id}").as_str().into(),
                |id| format!("{id}").as_str().into(),
            )
            .expect("SQL should render");
        expected.assert_eq(&ddl);
    }

    #[test]
    fn sql_mysql_cycles() {
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
            .ok()
            .and_then(|m| m.as_discrete())
            .unwrap();

        let ddl = SQLAnalysis::new(SQLBackend::MySQL).execute(
            &model,
            |id| format!("{id}").as_str().into(),
            |id| format!("{id}").as_str().into(),
        );
        let e = ddl.unwrap_err();
        assert_eq!(
            e,
            nonempty![SQLAnalysisError::CyclicForeignKeyError {
                backend: SQLBackend::MySQL,
                cycles: vec![
                    (
                        name("Snapshots"),
                        ColumnType::Deferrable { mor: name("for_ref"), tgt: name("Refs") }
                    ),
                    (
                        name("Refs"),
                        ColumnType::Deferrable {
                            mor: name("head"),
                            tgt: name("Snapshots")
                        }
                    )
                ]
            }]
        );
    }
}
