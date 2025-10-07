//! SQL
use crate::{dbl::model::DiscreteDblModel, zero::QualifiedName};
use crate::{dbl::model::*, one::FgCategory};
use crate::{one::Path, zero::name};
use itertools::Itertools;
use sea_query::SchemaBuilder;
use sea_query::{
    ColumnDef, ForeignKey, ForeignKeyCreateStatement, Iden, Table, TableCreateStatement,
    prepare::Write,
};
use std::{collections::HashMap, default::Default};

/// TODO
#[derive(Default, Debug)]
pub struct SqlBackend<T: SchemaBuilder + Default>(T);

impl<T: SchemaBuilder + Default> Clone for SqlBackend<T> {
    fn clone(&self) -> Self {
        SqlBackend(Default::default())
    }
}

impl Iden for QualifiedName {
    fn unquoted(&self, s: &mut dyn Write) {
        ToString::to_string(self).as_str().unquoted(s)
    }
}

fn table_morphisms(model: &DiscreteDblModel) -> HashMap<&QualifiedName, Vec<QualifiedName>> {
    model
        .mor_generators()
        .map(|mor| {
            let dom = model.get_dom(&mor).unwrap();
            (dom, mor)
        })
        .into_group_map()
}

fn create_stmts(
    model: &DiscreteDblModel,
    morphisms: HashMap<&QualifiedName, Vec<QualifiedName>>,
) -> HashMap<QualifiedName, TableCreateStatement> {
    model
        .objects_with_type(&name("Entity"))
        .map(|ob| {
            let t = morphisms
                .get(&ob)
                .unwrap_or(&Vec::<_>::new())
                .iter()
                // add morphisms
                .fold(
                    Table::create().table(ob.clone()).if_not_exists().col(
                        ColumnDef::new("id").integer().not_null().auto_increment().primary_key(),
                    ),
                    // if mor is a Mapping, it is an integer type column. otherwise, look to AttrTypes
                    |acc, mor| {
                        if &model.mor_generator_type(mor) == &Path::single(name("Mapping")) {
                            acc.col(ColumnDef::new(mor.clone()).integer().not_null())
                        } else {
                            acc.col(ColumnDef::new(mor.clone()).text().not_null())
                        }
                    },
                )
                .to_owned();
            (ob.clone(), t)
        })
        .collect()
}

fn fk_stmts(
    model: &DiscreteDblModel,
    morphisms: HashMap<&QualifiedName, Vec<QualifiedName>>,
) -> Vec<ForeignKeyCreateStatement> {
    morphisms
        .iter()
        .map(|(&src, tgts)| {
            tgts.iter()
                .filter(|mor| &model.mor_generator_type(mor) == &Path::single(name("Mapping")))
                .map(|mapping| {
                    let tgt = model.get_cod(&mapping).unwrap();
                    ForeignKey::create()
                        .name(format!("FK_{}_{}", src.clone(), tgt.clone()))
                        .from(src.clone(), mapping.clone())
                        .to(tgt.clone(), "id")
                        .to_owned()
                })
                .collect::<Vec<ForeignKeyCreateStatement>>()
        })
        .flatten()
        .collect()
}

/// TODO
pub fn build_schema<T: SchemaBuilder + Default>(
    model: &DiscreteDblModel,
    backend: SqlBackend<T>,
) -> Vec<String> {
    let morphisms = table_morphisms(model);
    let create_stmts: Vec<String> = create_stmts(model, morphisms.clone())
        .iter()
        .map(|(_, c)| c.to_string(backend.clone().0))
        .collect();
    let fk_stmts: Vec<String> = fk_stmts(model, morphisms)
        .iter()
        .map(|fk| fk.to_string(backend.clone().0))
        .collect();
    vec![create_stmts, fk_stmts].into_iter().flatten().collect()
}

/// TODO convert to schema statement
pub fn make_schema<T: SchemaBuilder + Default>(
    model: &DiscreteDblModel,
    backend: SqlBackend<T>,
) -> String {
    let morphisms = table_morphisms(model);
    let create_stmts = create_stmts(model, morphisms.clone())
        .iter()
        .map(|(_, c)| c.to_string(backend.clone().0))
        .join(";\n");
    let fk_stmts = fk_stmts(model, morphisms)
        .iter()
        .map(|fk| fk.to_string(backend.clone().0))
        .join(";\n");
    vec![create_stmts, fk_stmts].join(";\n\n")
}

#[cfg(test)]
mod tests {
    use sea_query::MysqlQueryBuilder;

    use super::*;
    use crate::dbl::model::*;
    use crate::stdlib::th_schema;
    use crate::zero::name;
    use std::rc::Rc;

    #[test]
    fn sql() {
        let mut model = DiscreteDblModel::new(Rc::new(th_schema()));
        let (person, dog) = (name("Person"), name("Dog"));
        model.add_ob(person.clone(), name("Entity"));
        model.add_ob(dog.clone(), name("Entity"));

        // `Person --walks--> Dog` means that the Person table gains a new column called "walks" so we should look at the domains of ...
        model.add_mor(name("walks"), person.clone(), dog.clone(), name("Mapping").into());

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

        let morphisms = table_morphisms(&model);
        let mut creates: Vec<String> = create_stmts(&model, morphisms.clone())
            .iter()
            .map(|(_, c)| c.to_string(MysqlQueryBuilder))
            .collect();
        creates.sort();

        assert_eq!(creates, raw_creates);

        let mut fks: Vec<String> = fk_stmts(&model, morphisms)
            .iter()
            .map(|fk| fk.to_string(MysqlQueryBuilder))
            .collect();
        fks.sort();

        assert_eq!(fks, raw_fks);

        // TODO Hash is nondeterministic
        // assert_eq!(make_schema(&model, SqlBackend(MysqlQueryBuilder)), raw.join("\n"));
    }
}
