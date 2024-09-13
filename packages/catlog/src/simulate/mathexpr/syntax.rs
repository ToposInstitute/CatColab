use super::span::Span;
use std::fmt;
use ustr::Ustr;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Sign {
    Plus,
    Minus,
}

impl fmt::Display for Sign {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Sign::Plus => write!(f, "+"),
            Sign::Minus => write!(f, "-"),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum LogSign {
    Multiply,
    Divide,
}

impl fmt::Display for LogSign {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogSign::Multiply => write!(f, "*"),
            LogSign::Divide => write!(f, "/"),
        }
    }
}

#[derive(Clone, PartialEq, Debug)]
pub(crate) enum Term {
    Sum(Vec<(Sign, Term)>),
    Product(Vec<(LogSign, Term)>),
    Var(Ustr, Span),
    Const(f32),
}

impl fmt::Display for Term {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Term::Sum(ts) => {
                write!(f, "(")?;
                let mut iter = ts.iter();
                if let Some((s, t)) = iter.next() {
                    write!(f, "{} {}", s, t)?;
                }
                for (s, t) in iter {
                    write!(f, " {} {}", s, t)?;
                }
                write!(f, ")")?;
            }
            Term::Product(ts) => {
                write!(f, "(")?;
                let mut iter = ts.iter();
                if let Some((s, t)) = iter.next() {
                    write!(f, "{} {}", s, t)?;
                }
                for (s, t) in iter {
                    write!(f, " {} {}", s, t)?;
                }
                write!(f, ")")?;
            }
            Term::Const(x) => {
                write!(f, "{}", x)?;
            }
            Term::Var(v, _) => {
                write!(f, "{}", v.as_str())?;
            }
        }
        Ok(())
    }
}
