use super::error::{Description, Error, Errors};
use super::parser;
use super::syntax::*;
use std::collections::HashMap;
use ustr::{ustr, Ustr};

/// A context listing variables in scope
pub struct Context<T: Clone> {
    vars: HashMap<Ustr, T>,
}

impl<T> Context<T>
where
    T: Clone,
{
    /// Creates a new context with the given variables
    pub fn new(vars: &[(&str, T)]) -> Self {
        Self {
            vars: HashMap::from_iter(vars.iter().map(|(s, v)| (ustr(s), v.clone()))),
        }
    }
}

impl<T: Clone> From<HashMap<Ustr, T>> for Context<T> {
    fn from(vars: HashMap<Ustr, T>) -> Self {
        Context { vars }
    }
}

pub(super) enum Compiled<T> {
    Sum(Vec<(Sign, Compiled<T>)>),
    Product(Vec<(LogSign, Compiled<T>)>),
    Const(f32),
    Var(T),
}

fn compile_term<T: Clone>(
    e: &Context<T>,
    t: &Term,
    errors: &mut Vec<Error>,
) -> Option<Compiled<T>> {
    match t {
        Term::Sum(ts) => Some(Compiled::Sum(
            ts.iter()
                .map(|(s, t)| compile_term(e, t, errors).map(|c| (*s, c)))
                .collect::<Option<Vec<(Sign, Compiled<T>)>>>()?,
        )),
        Term::Product(ts) => Some(Compiled::Product(
            ts.iter()
                .map(|(s, t)| compile_term(e, t, errors).map(|c| (*s, c)))
                .collect::<Option<Vec<(LogSign, Compiled<T>)>>>()?,
        )),
        Term::Const(x) => Some(Compiled::Const(*x)),
        Term::Var(v, s) => match e.vars.get(v) {
            Some(t) => Some(Compiled::Var(t.clone())),
            None => {
                errors.push(Error {
                    span: *s,
                    description: Description::NameNotFound { name: *v },
                });
                None
            }
        },
    }
}

/// A program that computes some value given values for the free variables in the program,
/// where the free variables are indexed by T.
///
/// Currently, this is just a wrapper around a term, but in the future we could compile further,
/// to a virtual machine or to webassembly.
pub struct Prog<T>(pub(super) Compiled<T>);

/// Compile a string to a program that will run in a environment where the free variables in e
/// have been given value.
///
/// This could a variety of errors: a lex error, a parse error, or a failure to lookup a free
/// variable error.
///
/// We currently don't expose these errors in a fine-grained way: we just return how they are
/// displayed as strings so that we are free to change their internal representation; in the future
/// we might think about how to expose more detailed errors to the user.
pub fn compile<T: Clone>(e: &Context<T>, src: &str) -> Result<Prog<T>, Errors> {
    let t = parser::parse(src)?;
    let mut errors = Vec::new();
    match compile_term(e, &t, &mut errors) {
        Some(c) => Ok(Prog(c)),
        None => Err(Errors(errors)),
    }
}

#[cfg(test)]
mod test {
    use expect_test::{expect, Expect};

    use super::super::pprint::WithSource;
    use super::{compile, Context};

    fn passes_check(e: &Context<()>, src: &str) {
        assert!(compile(e, src).is_ok());
    }

    fn fails_check(e: &Context<()>, src: &str, expected: Expect) {
        let error = format!("{}", WithSource::new(src, &compile(e, src).err().unwrap()));
        expected.assert_eq(&error);
    }

    #[test]
    fn basic_check() {
        let e = Context::new(&[("a", ()), ("b", ())]);

        passes_check(&e, "2 + a * b");

        fails_check(
            &e,
            "a + x",
            expect![[r#"
            compile error: name not found x

            1 | a + x
              |     ^

        "#]],
        );
    }
}
