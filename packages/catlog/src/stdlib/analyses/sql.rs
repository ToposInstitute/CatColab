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
use std::{collections::HashMap, default::Default};

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
    pub fn new(obns: Namespace, morns: Namespace, backend: &str) -> Result<SQLAnalysis, String> {
        if let Ok(backend) = SqlBackend::try_from(backend) {
            Ok(SQLAnalysis {
                obns,
                morns,
                backend,
            })
        } else {
            Err(String::from("!!!!"))
        }
    }

    pub fn render(&self, model: &DiscreteDblModel) -> String {
        // hashmap of sources and their targets
        let mut morphisms = model
            .mor_generators()
            // TODO mor_with_type?
            .filter_map(|mor| Some((model.get_dom(&mor)?.clone(), mor)))
            .into_group_map();

        for obj in model.objects_with_type(&name("Entity")) {
            morphisms.entry(obj.clone()).or_insert_with(|| Vec::new());
        }

        let tables: Vec<TableCreateStatement> = morphisms
            .into_iter()
            .map(|(ob, mors)| {
                let mut tbl = Table::create();

                // the targets for arrows
                let mut table_column_defs = mors.iter().fold(
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
                            acc.col(ColumnDef::new(mor_name.clone()).text().not_null())
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
        let output = tables
            .iter()
            .map(|table| match self.backend {
                SqlBackend::MySql => table.to_string(MysqlQueryBuilder),
                SqlBackend::Sqlite => table.to_string(SqliteQueryBuilder),
                SqlBackend::Postgres => table.to_string(PostgresQueryBuilder),
            })
            .join(";\n");

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

#[derive(Debug, Clone)]
pub enum SqlBackend {
    MySql,
    Sqlite,
    Postgres,
}

impl SqlBackend {
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

#[cfg(test)]
mod tests {
    use sea_query::MysqlQueryBuilder;

    use super::*;
    use crate::dbl::model::*;
    use crate::stdlib::th_schema;
    use crate::zero::{name, Namespace};
    use std::rc::Rc;

    #[test]
    fn sql() {
        let mut model = DiscreteDblModel::new(Rc::new(th_schema()));
        let (person, dog) = (name("Person"), name("Dog"));
        model.add_ob(person.clone(), name("Entity"));
        model.add_ob(dog.clone(), name("Entity"));
        let mut obns = Namespace::new_for_text();
        let mut morns = Namespace::new_for_text();
        // obns.set_label(name("Person"), name("Person"));

        // `Person --walks--> Dog` means that the Person table gains a new column called "walks" so we should look at the domains of ...
        model.add_mor(name("walks"), person.clone(), dog.clone(), name("Entity").into());

        let moniker = name("Name");
        model.add_ob(moniker.clone(), name("AttrType"));
        // possibility for conflict
        model.add_mor(name("person_name"), person.clone(), moniker.clone(), name("Attr").into());
        model.add_mor(name("dog_name"), dog.clone(), moniker.clone(), name("Attr").into());

        let raw_creates = vec![
            r"CREATE TABLE IF NOT EXISTS `Dog` ( `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY, `dog_name` text NOT NULL )",
            r"CREATE TABLE IF NOT EXISTS `Person` ( `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY, `walks` int NOT NULL, `person_name` text NOT NULL )",
        ];

        let raw_fks = vec![
            r"ALTER TABLE `Person` ADD CONSTRAINT `FK_Person_Dog` FOREIGN KEY (`walks`) REFERENCES `Dog` (`id`)",
        ];

        let ddl = SQLAnalysis::new(obns, morns, "mysql").expect("!").render(&model);

        // TODO Hash is nondeterministic
        assert_eq!(ddl, [raw_creates.join(";\n"), raw_fks.join(";\n")].join(";\n"));
    }

    #[test]
    fn sql_aswell() {}
}
