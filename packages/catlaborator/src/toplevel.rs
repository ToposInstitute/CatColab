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
    use catlog::stdlib::{th_category, th_schema, th_signed_category};
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
            write!(out.borrow_mut(), "{:?}", res).unwrap();
        }
        expected.assert_eq(&*out.borrow());
        res
    }

    #[test]
    fn trivial() {
        test("{}", expect![[r#""good""#]], |_, _| "good".to_string());
    }

    fn test_ty(input: &str, expected: Expect) {
        let test_schema: Rc<Schema> = Rc::new(th_category());
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
            expect![[r#"
                error[elab]: no such object type object
                1| @Ob object 
                1| ^^^^^^^^^^
                None"#]],
        );
    }

    #[test]
    fn notebook_elab() {
        let test_schema1: Rc<Schema> = Rc::new(th_signed_category());
        let test_schema2: Rc<Schema> = Rc::new(th_schema());
        let mut state = State::empty();
        let nb1 = test_notebook(
            r#"{
                a: @Ob Object;
                b: @Ob Object;
                f: @Mor (@Id Object) a b;
            }"#,
            expect![[r#"Some(Notebook { cells: [Cell { name: u!("a"), ty: Object(u!("Object")) }, Cell { name: u!("b"), ty: Object(u!("Object")) }, Cell { name: u!("f"), ty: Morphism(Id(u!("Object")), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }] })"#]],
            test_schema1.clone(),
            &state,
        ).unwrap();
        state.insert_notebook("A", nb1);
        test_notebook(
            r#"{
                a: @Ob Object;
                b: @Ob Object;
                c: @Ob Object;
                f: @Mor Negative a b;
                g: @Mor Negative b c;
                h: @Mor (@Id Object) a c;
                e: (f * g) == h;
            }"#,
            expect![[
                r#"Some(Notebook { cells: [Cell { name: u!("a"), ty: Object(u!("Object")) }, Cell { name: u!("b"), ty: Object(u!("Object")) }, Cell { name: u!("c"), ty: Object(u!("Object")) }, Cell { name: u!("f"), ty: Morphism(Seq(NonEmpty { head: u!("Negative"), tail: [] }), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("g"), ty: Morphism(Seq(NonEmpty { head: u!("Negative"), tail: [] }), Var(Lvl { lvl: 1, name: Some(u!("b")) }), Var(Lvl { lvl: 2, name: Some(u!("c")) })) }, Cell { name: u!("h"), ty: Morphism(Id(u!("Object")), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 2, name: Some(u!("c")) })) }, Cell { name: u!("e"), ty: Equality(Compose(Var(Lvl { lvl: 3, name: Some(u!("f")) }), Var(Lvl { lvl: 4, name: Some(u!("g")) })), Var(Lvl { lvl: 5, name: Some(u!("h")) })) }] })"#
            ]],
            test_schema1.clone(),
            &state,
        );
        test_notebook(
            r#"{
                a: @Ob Object;
                b: @Ob Object;
                c: @Ob Object;
                f: @Mor Negative a b;
                g: @Mor (@Id Object) b c;
                h: @Mor (@Id Object) a c;
                e: (f * g) == h;
            }"#,
            expect![[r#"
                error[elab]: expected term of type Morphism(Seq(NonEmpty { head: u!("Negative"), tail: [] }), 16, 20) got Morphism(Id(u!("Object")), 16, 20)
                8|                 e: (f * g) == h;
                8|                               ^
                None"#]],
            test_schema1.clone(),
            &state,
        );
        test_notebook(
            r#"{
                a: @Ob Entity;
                b: @Ob Entity;
                f: @Mor Attr a b;
            }"#,
            expect![[r#"
                error[elab]: expected term of type Object(u!("AttrType")) got Object(u!("Entity"))
                4|                 f: @Mor Attr a b;
                4|                                ^
                None"#]],
            test_schema2.clone(),
            &state,
        );
        test_notebook(
            r#"{
                a: @Ob Entity;
                b: @Ob Entity;
                f: @Mor (@Id Entity) a b;
                g: @Mor (@Id Entity) a b;
                e: f == g;
            }"#,
            expect![[
                r#"Some(Notebook { cells: [Cell { name: u!("a"), ty: Object(u!("Entity")) }, Cell { name: u!("b"), ty: Object(u!("Entity")) }, Cell { name: u!("f"), ty: Morphism(Id(u!("Entity")), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("g"), ty: Morphism(Id(u!("Entity")), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("e"), ty: Equality(Var(Lvl { lvl: 2, name: Some(u!("f")) }), Var(Lvl { lvl: 3, name: Some(u!("g")) })) }] })"#
            ]],
            test_schema2.clone(),
            &state,
        );
        test_notebook(
            r#"{
                a: @Ob Entity;
                b: @Ob Entity;
                f: @Mor (@Id Entity) a b;
                g: @Mor (@Id Entity) b a;
                e: f == g;
            }"#,
            expect![[r#"
                error[elab]: expected term of type Morphism(Id(u!("Entity")), 36, 38) got Morphism(Id(u!("Entity")), 38, 36)
                6|                 e: f == g;
                6|                         ^
                None"#]],
            test_schema2.clone(),
            &state,
        );
        test_notebook(
            r#"{
                a: @Ob Entity;
                b: @Ob Entity;
                f: @Mor (@Id Entity) a b;
                g: @Mor (@Id Entity) b a;
                e1: a == b;
                e2: f == g;
            }"#,
            expect![[
                r#"Some(Notebook { cells: [Cell { name: u!("a"), ty: Object(u!("Entity")) }, Cell { name: u!("b"), ty: Object(u!("Entity")) }, Cell { name: u!("f"), ty: Morphism(Id(u!("Entity")), Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("g"), ty: Morphism(Id(u!("Entity")), Var(Lvl { lvl: 1, name: Some(u!("b")) }), Var(Lvl { lvl: 0, name: Some(u!("a")) })) }, Cell { name: u!("e1"), ty: Equality(Var(Lvl { lvl: 0, name: Some(u!("a")) }), Var(Lvl { lvl: 1, name: Some(u!("b")) })) }, Cell { name: u!("e2"), ty: Equality(Var(Lvl { lvl: 2, name: Some(u!("f")) }), Var(Lvl { lvl: 3, name: Some(u!("g")) })) }] })"#
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
                error[elab]: expected term of type Morphism(Id(u!("Object")), 60, 67) got Morphism(Id(u!("Object")), 67, 67)
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
