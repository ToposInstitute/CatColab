//! Produces a valid SQL data definition script from a model in a theory of schemas.

mod analysis;
mod extract_discrete;
mod extract_modal;
mod ir;

pub use analysis::*;
pub use ir::{ColumnInfo, SchemaInfo, TableInfo};

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::{
        dbl::modal::theory::ModeApp,
        dbl::model::{ModalDblModel, ModalOb, MutDblModel},
        stdlib::{th_schema, th_schema_maybe},
        tt,
        zero::name,
    };

    #[test]
    fn sql_schema() {
        let th = Rc::new(th_schema());
        let model = tt::modelgen::Model::from_text(
            &th.into(),
            "[
                Person : Entity,
                Dog : Entity,
                walks : (Hom Entity)[Person, Dog],
                Hair : AttrType,
                has : Attr[Person, Hair],
            ]",
        );
        let model = model.ok().and_then(|m| m.as_discrete()).unwrap();

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
    fn sql_schema_maybe() {
        let th = Rc::new(th_schema_maybe());
        let mut model = ModalDblModel::new(th);

        let entity_type = ModeApp::new(name("Entity"));
        let attr_type = ModeApp::new(name("AttrType"));

        // Tables: TFoo, TBar, TBaz
        let tfoo = name("TFoo");
        let tbar = name("TBar");
        let tbaz = name("TBaz");
        model.add_ob(tfoo.clone(), entity_type.clone());
        model.add_ob(tbar.clone(), entity_type.clone());
        model.add_ob(tbaz.clone(), entity_type.clone());

        // Attribute types: A1, A2
        let a1 = name("A1");
        let a2 = name("A2");
        model.add_ob(a1.clone(), attr_type.clone());
        model.add_ob(a2.clone(), attr_type.clone());

        let tfoo_ob = ModalOb::Generator(tfoo.clone());
        let tbar_ob = ModalOb::Generator(tbar.clone());
        let tbaz_ob = ModalOb::Generator(tbaz.clone());
        let a1_ob = ModalOb::Generator(a1.clone());
        let a2_ob = ModalOb::Generator(a2.clone());

        // TFoo --bar--> Maybe(TBaz)   (nullable FK)
        model.add_mor(
            name("bar"),
            tfoo_ob.clone(),
            ModalOb::Maybe(Box::new(tbaz_ob.clone())),
            ModeApp::new(name("MaybeRel")).into(),
        );
        // TFoo --baz--> TBar           (non-nullable FK)
        model.add_mor(
            name("baz"),
            tfoo_ob.clone(),
            tbar_ob.clone(),
            ModeApp::new(name("Rel")).into(),
        );
        // TBar --a1--> A1              (non-nullable attribute)
        model.add_mor(
            name("a1"),
            tbar_ob.clone(),
            a1_ob.clone(),
            ModeApp::new(name("Attr")).into(),
        );
        // TBaz --a2--> Maybe(A2)       (nullable attribute)
        model.add_mor(
            name("a2"),
            tbaz_ob.clone(),
            ModalOb::Maybe(Box::new(a2_ob.clone())),
            ModeApp::new(name("MaybeAttr")).into(),
        );

        let expected = expect![[r#"
            CREATE TABLE IF NOT EXISTS `TBaz` (
              `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
              `a2` A2 NULL
            );

            CREATE TABLE IF NOT EXISTS `TBar` (
              `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
              `a1` A1 NOT NULL
            );

            CREATE TABLE IF NOT EXISTS `TFoo` (
              `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
              `bar` int NULL,
              `baz` int NOT NULL,
              CONSTRAINT `FK_bar_TFoo_TBaz` FOREIGN KEY (`bar`) REFERENCES `TBaz` (`id`),
              CONSTRAINT `FK_baz_TFoo_TBar` FOREIGN KEY (`baz`) REFERENCES `TBar` (`id`)
            );"#]];
        let ddl = SQLAnalysis::new(SQLBackend::MySQL)
            .render_modal(
                &model,
                &entity_type,
                |id| format!("{id}").as_str().into(),
                |id| format!("{id}").as_str().into(),
            )
            .expect("SQL should render");
        expected.assert_eq(&ddl);
    }
}
