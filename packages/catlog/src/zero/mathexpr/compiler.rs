use super::parser;
use super::pprint::DisplayWithSource;
use super::pprint::WithSource;
use super::span::Span;
use super::syntax::*;
use std::collections::HashMap;
use std::fmt::Write as _;
use ustr::{ustr, Ustr};

pub(super) enum Error {
    InvalidVariable(Span),
}

impl DisplayWithSource for Error {
    fn fmt(&self, src: &str, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Error::InvalidVariable(s) => {
                writeln!(f, "error: no such variable")?;
                write!(f, "{}", WithSource::new(src, s))?;
            }
        }
        Ok(())
    }
}

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
                errors.push(Error::InvalidVariable(*s));
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
pub fn compile<T: Clone>(e: &Context<T>, src: &str) -> Result<Prog<T>, String> {
    let t = match parser::parse(src) {
        Ok(t) => t,
        Err(e) => {
            return Err(format!("{}", WithSource::new(src, &e)));
        }
    };
    let mut errors = Vec::new();
    match compile_term(e, &t, &mut errors) {
        Some(c) => Ok(Prog(c)),
        None => {
            let mut s = String::new();
            for err in errors {
                write!(s, "{}", WithSource::new(src, &err)).unwrap();
            }
            Err(s)
        }
    }
}

#[cfg(test)]
mod test {
    use indoc::indoc;

    use super::{compile, Context};

    fn passes_check(e: &Context<()>, src: &str) {
        assert!(compile(e, src).is_ok());
    }

    fn fails_check(e: &Context<()>, src: &str, expected: &str) {
        let error = compile(e, src).err().unwrap();
        assert_eq!(&error, expected);
    }

    #[test]
    fn basic_check() {
        let e = Context::new(&[("a", ()), ("b", ())]);

        passes_check(&e, "2 + a * b");

        fails_check(
            &e,
            "a + x",
            indoc! { r#"
                error: no such variable
                1 | a + x
                  |     ^
            "# },
        );
    }
}
