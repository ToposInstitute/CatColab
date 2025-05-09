use std::{cell::RefCell, collections::HashMap, rc::Rc};

use fexplib::{parser::Prec, *};

use crate::{eval::ClassLibrary, syntax::ClassStx};

pub const PARSE_CONFIG: ParseConfig = ParseConfig::new(
    &[
        ("=", Prec::nonassoc(10)),
        (":", Prec::nonassoc(20)),
        ("==", Prec::nonassoc(20)),
        ("*", Prec::lassoc(60)),
    ],
    &["=", ":", "==", "*"],
);

#[derive(Clone)]
pub struct Toplevel {
    classes: Rc<RefCell<HashMap<&'static str, Rc<ClassStx>>>>,
}

impl Toplevel {
    pub fn new() -> Self {
        Self {
            classes: Rc::new(RefCell::new(HashMap::new())),
        }
    }

    fn insert_notebook(&mut self, name: &'static str, class: ClassStx) {
        self.classes.borrow_mut().insert(name, Rc::new(class));
    }
}

impl ClassLibrary for Toplevel {
    fn lookup<'a>(&'a self, id: &str) -> Option<Rc<ClassStx>> {
        self.classes.borrow().get(id).cloned()
    }
}

// #[cfg(test)]
// mod test {
//     use crate::elab::{Elaborator, Schema};
//     use crate::eval::NotebookStorage;
//     use crate::syntax::Notebook;

//     use super::*;
//     use catlog::stdlib::{th_schema, th_signed_category};
//     use expect_test::*;
//     use indoc::indoc;
//     use std::fmt::Debug;
//     use std::rc::Rc;
//     use tattle::Reporter;
//     use tattle::display::SourceInfo;

//     fn test<T: Debug, F: FnOnce(&FExp, Reporter) -> Option<T>>(
//         input: &str,
//         expected: Expect,
//         f: F,
//     ) -> Option<T> {
//         let reporter = Reporter::new();
//         let res = PARSE_CONFIG.with_parsed(input, reporter.clone(), |e| f(e, reporter.clone()));
//         expected.assert_eq(&SourceInfo::new(None, input).extract_report_to_string(reporter));
//         res
//     }

//     fn test_notebook(
//         input: &str,
//         expected: Expect,
//         schema: Rc<Schema>,
//         notebooks: Rc<dyn NotebookStorage>,
//     ) -> Option<Notebook> {
//         test(input, expected, |e, r| {
//             let elaborator = Elaborator::new(r, schema.clone());
//             elaborator.notebook(notebooks, e)
//         })
//     }

//     #[test]
//     fn notebook_elab() {
//         let test_schema1: Rc<Schema> = Rc::new(th_signed_category());
//         let test_schema2: Rc<Schema> = Rc::new(th_schema());
//         let mut toplevel = Toplevel::new();
//         let nb1 = test_notebook(
//             indoc! {r#"{
//                 a: @Ob Object;
//                 b: @Ob Object;
//                 f: @Mor (@Id Object) a b;
//             }"#},
//             expect![""],
//             test_schema1.clone(),
//             Rc::new(toplevel.clone()),
//         )
//         .unwrap();
//         toplevel.insert_notebook("A", nb1);
//         // TODO: decide equality of morphism types
//         // test_notebook(
//         //     r#"{
//         //         a: @Ob Object;
//         //         b: @Ob Object;
//         //         c: @Ob Object;
//         //         f: @Mor Negative a b;
//         //         g: @Mor Negative b c;
//         //         h: @Mor (@Id Object) a c;
//         //         e: (f * g) == h;
//         //     }"#,
//         //     expect![""],
//         //     test_schema1.clone(),
//         //     Rc::new(toplevel.clone()),
//         // );
//         test_notebook(
//             indoc! {r#"{
//                 a: @Ob Object;
//                 b: @Ob Object;
//                 c: @Ob Object;
//                 f: @Mor Negative a b;
//                 g: @Mor (@Id Object) b c;
//                 h: @Mor (@Id Object) a c;
//                 e: (f * g) == h;
//             }"#},
//             expect![[r#"
//                 error[elab]: expected term of type @Mor ( Negative ) a c got @Mor ( @Id Object ) a c
//                 --> <none>:8:19
//                 8|     e: (f * g) == h;
//                 8|                   ^
//             "#]],
//             test_schema1.clone(),
//             Rc::new(toplevel.clone()),
//         );
//         test_notebook(
//             indoc! {r#"{
//                 a: @Ob Entity;
//                 b: @Ob Entity;
//                 f: @Mor Attr a b;
//             }"#},
//             expect![[r#"
//                 error[elab]: expected term of type @Ob AttrType got @Ob Entity
//                 --> <none>:4:20
//                 4|     f: @Mor Attr a b;
//                 4|                    ^
//             "#]],
//             test_schema2.clone(),
//             Rc::new(toplevel.clone()),
//         );
//         test_notebook(
//             indoc! {r#"{
//                 a: @Ob Entity;
//                 b: @Ob Entity;
//                 f: @Mor (@Id Entity) a b;
//                 g: @Mor (@Id Entity) a b;
//                 e: f == g;
//             }"#},
//             expect![""],
//             test_schema2.clone(),
//             Rc::new(toplevel.clone()),
//         );
//         test_notebook(
//             indoc! {r#"{
//                 a: @Ob Entity;
//                 b: @Ob Entity;
//                 f: @Mor (@Id Entity) a b;
//                 g: @Mor (@Id Entity) b a;
//                 e: f == g;
//             }"#},
//             expect![[r#"
//                 error[elab]: expected term of type @Mor ( @Id Entity ) a b got @Mor ( @Id Entity ) b a
//                 --> <none>:6:13
//                 6|     e: f == g;
//                 6|             ^
//             "#]],
//             test_schema2.clone(),
//             Rc::new(toplevel.clone()),
//         );
//         test_notebook(
//             indoc! {r#"{
//                 a: @Ob Entity;
//                 b: @Ob Entity;
//                 f: @Mor (@Id Entity) a b;
//                 g: @Mor (@Id Entity) b a;
//                 e1: a == b;
//                 e2: f == g;
//             }"#},
//             expect![""],
//             test_schema2.clone(),
//             Rc::new(toplevel.clone()),
//         );
//         test_notebook(
//             indoc! {r#"{
//                 n: @Notebook A;
//                 m: @Notebook A;
//                 e1: n.b == m.a;
//                 e2: n.a == m.b;
//                 e3: (n.f * m.f) == @id m.b;
//             }"#},
//             expect![""],
//             test_schema2.clone(),
//             Rc::new(toplevel.clone()),
//         );
//         test_notebook(
//             indoc! {r#"{
//                 n: @Notebook A;
//                 m: @Notebook A;
//                 e1: n.b == m.a;
//                 e3: (n.f * m.f) == @id m.b;
//             }"#},
//             expect![[r#"
//                 error[elab]: expected term of type @Mor ( @Id Object ) n.a m.b got @Mor ( @Id Object ) m.b m.b
//                 --> <none>:5:24
//                 5|     e3: (n.f * m.f) == @id m.b;
//                 5|                        ^^^^^^^
//             "#]],
//             test_schema2.clone(),
//             Rc::new(toplevel.clone()),
//         );

//         test_notebook(
//             indoc! {r#"{
//                 n: @Notebook A;
//                 m: @Notebook A;
//                 e2: n.a == m.b;
//                 e3: (n.f * m.f) == @id m.b;
//             }"#},
//             expect![[r#"
//                 error[elab]: when attempting to compose, could not unify codomain of n.f (n.b) with domain of m.f (m.a)
//                 --> <none>:5:10
//                 5|     e3: (n.f * m.f) == @id m.b;
//                 5|          ^^^^^^^^^
//             "#]],
//             test_schema2.clone(),
//             Rc::new(toplevel.clone()),
//         );
//     }

//     #[test]
//     fn test_notebooks() {}
// }
