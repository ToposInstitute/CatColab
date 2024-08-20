use super::parser;
use super::pprint::DisplayWithSource;
use super::pprint::WithSource;
use super::span::Span;
use super::syntax::*;
use std::collections::HashSet;
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
pub struct Context {
    vars: HashSet<Ustr>,
}

impl Context {
    /// Creates a new context with the given variables
    pub fn new(vars: &[&str]) -> Self {
        Self {
            vars: HashSet::from_iter(vars.iter().map(|s| ustr(s))),
        }
    }
}

fn check_accum(e: &Context, t: &Term, errors: &mut Vec<Error>) {
    match t {
        Term::Sum(ts) => {
            ts.iter().for_each(|(_, t)| check_accum(e, t, errors));
        }
        Term::Product(ts) => {
            ts.iter().for_each(|(_, t)| check_accum(e, t, errors));
        }
        Term::Const(_) => (),
        Term::Var(v, s) => {
            if !e.vars.contains(v) {
                errors.push(Error::InvalidVariable(*s));
            }
        }
    };
}

pub(super) fn check(e: &Context, t: &Term) -> Result<(), Vec<Error>> {
    let mut errors = Vec::new();
    check_accum(e, t, &mut errors);
    if !errors.is_empty() {
        Err(errors)
    } else {
        Ok(())
    }
}

/// A program that computes some value given values for the free variables in the program.
///
/// Currently, this is just a wrapper around a term, but in the future we could compile further,
/// to a virtual machine or to webassembly.
pub struct Prog(pub(super) Term);

/// Compile a string to a program that will run in a environment where the free variables in e
/// have been given value.
///
/// This could a variety of errors: a lex error, a parse error, or a failure to lookup a free
/// variable error.
///
/// We currently don't expose these errors in a fine-grained way: we just return how they are
/// displayed as strings so that we are free to change their internal representation; in the future
/// we might think about how to expose more detailed errors to the user.
pub fn compile(e: &Context, src: &str) -> Result<Prog, String> {
    let t = match parser::parse(src) {
        Ok(t) => t,
        Err(e) => {
            return Err(format!("{}", WithSource::new(src, &e)));
        }
    };
    match check(e, &t) {
        Ok(_) => Ok(Prog(t)),
        Err(errs) => {
            let mut s = String::new();
            for err in errs {
                writeln!(s, "{}", WithSource::new(src, &err)).unwrap();
            }
            Err(s)
        }
    }
}

#[cfg(test)]
mod test {
    use super::WithSource;
    use indoc::indoc;

    use super::super::parser;
    use super::{check, Context};
    use std::fmt::Write as _;

    fn passes_check(e: &Context, src: &str) {
        let t = parser::parse(src).unwrap();

        assert!(check(e, &t).is_ok());
    }

    fn fails_check(e: &Context, src: &str, message: &str) {
        let t = parser::parse(src).unwrap();

        let errors = check(e, &t).err().unwrap();

        let mut s = String::new();
        for error in errors.iter() {
            write!(s, "{}", WithSource::new(src, error)).unwrap();
        }
        assert_eq!(&s, message);
    }

    #[test]
    fn basic_check() {
        let e = Context::new(&["a", "b"]);

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
