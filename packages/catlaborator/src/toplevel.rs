use bumpalo::Bump;
use fexplib::grammar::parse;
use fexplib::lexer::lex;
use fexplib::parser::Prec;
use fexplib::types::*;
use std::collections::HashMap;
use tattle::Reporter;

const PRECTABLE: &[(&str, Prec)] = &[
    ("=", Prec::nonassoc(10)),
    (":", Prec::nonassoc(20)),
    ("==", Prec::nonassoc(20)),
    ("*", Prec::lassoc(60)),
];

const KEYWORDTABLE: &[&str] = &["=", ":", "==", "*"];

pub fn with_parsed<T, F: FnMut(&FExp) -> T>(
    input: &str,
    reporter: Reporter,
    mut f: F,
) -> Option<T> {
    let prectable: HashMap<_, _> =
        PRECTABLE.iter().map(|(name, p)| (name.to_string(), *p)).collect();
    let tokens = lex(input, KEYWORDTABLE, reporter.clone());
    let arena = Bump::new();
    let ast = parse(input, reporter.clone(), &prectable, &tokens, &arena);
    if reporter.errored() {
        None
    } else {
        Some(f(ast))
    }
}

#[cfg(test)]
mod test {
    use crate::elab::{Context, Elaborator, Schema};
    use crate::eval::State;
    use crate::syntax::Notebook;

    use super::*;
    use expect_test::*;
    use std::cell::RefCell;
    use std::fmt::{Debug, Write};
    use std::rc::Rc;
    use tattle::ReporterOutput;

    fn test<T: Debug, F: FnMut(&FExp, Reporter) -> T>(
        input: &str,
        expected: Expect,
        mut f: F,
    ) -> Option<T> {
        let out = Rc::new(RefCell::new(String::new()));
        let reporter = Reporter::new(ReporterOutput::String(out.clone()), input.to_string());
        let res = with_parsed(input, reporter.clone(), |e| f(e, reporter.clone()));
        if let Some(res) = &res {
            write!(out.borrow_mut(), "{:?}", res);
        }
        expected.assert_eq(&*out.borrow());
        res
    }

    #[test]
    fn trivial() {
        test("{}", expect![[r#""good""#]], |_, _| "good".to_string());
    }

    fn test_ty(input: &str, expected: Expect) {
        let test_schema: Rc<Schema> = Rc::new(Schema {
            obtypes: ["object".into()].into(),
            mortypes: [("morphism".into(), ("object".into(), "object".into()))].into(),
        });
        test(input, expected, |e, r| {
            let elaborator = Elaborator::new(r, test_schema.clone());
            let ctx = Context::new(&State::empty());
            elaborator.ty(&ctx, e)
        });
    }

    fn test_notebook(
        input: &str,
        expected: Expect,
        schema: Rc<Schema>,
        state: &State,
    ) -> Option<Notebook> {
        test(input, expected, |e, r| {
            let elaborator = Elaborator::new(r, schema.clone());
            elaborator.notebook(state, e)
        })
        .flatten()
    }

    #[test]
    fn ty_elab() {
        test_ty(
            "@Ob object",
            expect![[r#"Some((Object(ObType(u!("object"))), Object(ObType(u!("object")))))"#]],
        );
    }

    #[test]
    fn notebook_elab() {
        let test_schema1: Rc<Schema> = Rc::new(Schema {
            obtypes: ["object".into()].into(),
            mortypes: [("morphism".into(), ("object".into(), "object".into()))].into(),
        });
        let test_schema2: Rc<Schema> = Rc::new(Schema {
            obtypes: ["object".into(), "attr".into()].into(),
            mortypes: [("morphism".into(), ("object".into(), "object".into()))].into(),
        });
        let mut state = State::empty();
        let nb1 = test_notebook(
            r#"{
                a: @Ob object;
                b: @Ob object;
                f: @Mor (@Id object) a b;
            }"#,
            expect![[r#"Some(Notebook { cells: [Cell { name: u!("a"), ty: Object(ObType(u!("object"))) }, Cell { name: u!("b"), ty: Object(ObType(u!("object"))) }, Cell { name: u!("f"), ty: Morphism(Id(ObType(u!("object"))), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }] })"#]],
            test_schema1.clone(),
            &state,
        ).unwrap();
        state.insert_notebook("A", nb1);
        test_notebook(
            r#"{
                a: @Ob object;
                b: @Ob attr;
                f: @Mor morphism a b;
            }"#,
            expect![[r#"
                error[elab]: expected term of type Object(ObType(u!("object"))) got Object(ObType(u!("attr")))
                4|                 f: @Mor morphism a b;
                4|                                    ^
                None"#]],
            test_schema2.clone(),
            &state,
        );
        test_notebook(
            r#"{
                a: @Ob object;
                b: @Ob object;
                f: @Mor morphism a b;
                g: @Mor morphism a b;
                e: f == g;
            }"#,
            expect![[
                r#"Some(Notebook { cells: [Cell { name: u!("a"), ty: Object(ObType(u!("object"))) }, Cell { name: u!("b"), ty: Object(ObType(u!("object"))) }, Cell { name: u!("f"), ty: Morphism(Generator(u!("morphism")), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("g"), ty: Morphism(Generator(u!("morphism")), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("e"), ty: Equality(Var(Lvl { lvl: 2, name: Some(u!("f")) }), Var(Lvl { lvl: 3, name: Some(u!("g")) })) }] })"#
            ]],
            test_schema2.clone(),
            &state,
        );
        test_notebook(
            r#"{
                a: @Ob object;
                b: @Ob object;
                f: @Mor morphism a b;
                g: @Mor morphism b a;
                e: f == g;
            }"#,
            expect![[r#"
                error[elab]: expected term of type Morphism(Generator(u!("morphism")), 16, 18) got Morphism(Generator(u!("morphism")), 18, 16)
                6|                 e: f == g;
                6|                         ^
                None"#]],
            test_schema2.clone(),
            &state,
        );
        test_notebook(
            r#"{
                a: @Ob object;
                b: @Ob object;
                f: @Mor morphism a b;
                g: @Mor morphism b a;
                e1: a == b;
                e2: f == g;
            }"#,
            expect![[
                r#"Some(Notebook { cells: [Cell { name: u!("a"), ty: Object(ObType(u!("object"))) }, Cell { name: u!("b"), ty: Object(ObType(u!("object"))) }, Cell { name: u!("f"), ty: Morphism(Generator(u!("morphism")), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("g"), ty: Morphism(Generator(u!("morphism")), Var(Lvl { lvl: 1, name: Some(u!("b")) }), Var(Lvl { lvl: 0, name: Some(u!("a")) })) }, Cell { name: u!("e1"), ty: Equality(Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("e2"), ty: Equality(Var(Lvl { lvl: 2, name: Some(u!("f")) }), Var(Lvl { lvl: 3, name: Some(u!("g")) })) }] })"#
            ]],
            test_schema2.clone(),
            &state,
        );
        test_notebook(
            r#"{
                n: @Notebook A;
                m: @Notebook A;
                e1: n.b == m.a;
                e2: n.a == m.b;
                e3: (n.f * m.f) == @id m.b;
            }"#,
            expect![[
                r#"Some(Notebook { cells: [Cell { name: u!("n"), ty: Notebook(NotebookRef { id: u!("A") }) }, Cell { name: u!("m"), ty: Notebook(NotebookRef { id: u!("A") }) }, Cell { name: u!("e1"), ty: Equality(Proj(Var(Lvl { lvl: 0, name: Some(u!("n")) }), Field { lvl: 1, name: Some(u!("b")) }), Proj(Var(Lvl { lvl: 1, name: Some(u!("m")) }), Field { lvl: 0, name: Some(u!("a")) })) }, Cell { name: u!("e2"), ty: Equality(Proj(Var(Lvl { lvl: 0, name: Some(u!("n")) }), Field { lvl: 0, name: Some(u!("a")) }), Proj(Var(Lvl { lvl: 1, name: Some(u!("m")) }), Field { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("e3"), ty: Equality(Compose(Proj(Var(Lvl { lvl: 0, name: Some(u!("n")) }), Field { lvl: 2, name: Some(u!("f")) }), Proj(Var(Lvl { lvl: 1, name: Some(u!("m")) }), Field { lvl: 2, name: Some(u!("f")) })), Identity(Proj(Var(Lvl { lvl: 1, name: Some(u!("m")) }), Field { lvl: 1, name: Some(u!("b")) }))) }] })"#
            ]],
            test_schema2.clone(),
            &state,
        );
        test_notebook(
            r#"{
                n: @Notebook A;
                m: @Notebook A;
                e1: n.b == m.a;
                e3: (n.f * m.f) == @id m.b;
            }"#,
            expect![[r#"
                error[elab]: expected term of type Morphism(Id(ObType(u!("object"))), 40, 47) got Morphism(Id(ObType(u!("object"))), 47, 47)
                5|                 e3: (n.f * m.f) == @id m.b;
                5|                                    ^^^^^^^
                None"#]],
            test_schema2.clone(),
            &state,
        );

        test_notebook(
            r#"{
                n: @Notebook A;
                m: @Notebook A;
                e2: n.a == m.b;
                e3: (n.f * m.f) == @id m.b;
            }"#,
            expect![[r#"
                error[elab]: mismatching domain and codomain for composite
                5|                 e3: (n.f * m.f) == @id m.b;
                5|                      ^^^^^^^^^
                None"#]],
            test_schema2.clone(),
            &state,
        );
    }

    #[test]
    fn test_notebooks() {}
}
