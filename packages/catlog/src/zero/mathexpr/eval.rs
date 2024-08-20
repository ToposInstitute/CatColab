use super::{syntax::*, Prog};
use std::collections::HashMap;
use ustr::{ustr, Ustr};

/// A mapping of free variables to values
pub struct Env {
    vars: HashMap<Ustr, f32>,
}

impl Env {
    /// Construct a new environment with a given mapping of variables to values
    pub fn new(vars: &[(&str, f32)]) -> Self {
        Self {
            vars: HashMap::from_iter(vars.iter().map(|(s, v)| (ustr(s), *v))),
        }
    }
}

pub(super) fn evalt(e: &Env, t: &Term) -> f32 {
    match t {
        Term::Sum(ts) => {
            ts.iter().map(|(s, t)| (s, evalt(e, t))).fold(0.0, |acc, (s, v)| match s {
                Sign::Plus => acc + v,
                Sign::Minus => acc - v,
            })
        }
        Term::Product(ts) => {
            ts.iter().map(|(s, t)| (s, evalt(e, t))).fold(1.0, |acc, (s, v)| match s {
                LogSign::Multiply => acc * v,
                LogSign::Divide => acc / v,
            })
        }
        Term::Const(x) => *x,
        Term::Var(v, _) => *(e.vars.get(v).unwrap()),
    }
}

/// Evaluate a checked expression in with values for free variables given by `e`
pub fn eval(e: &Env, expr: &Prog) -> f32 {
    evalt(e, &expr.0)
}

#[cfg(test)]
mod test {
    use super::super::parser;

    use super::{evalt, Env};

    fn check(e: &Env, src: &str, value: f32) {
        let t = parser::parse(src).unwrap();

        assert_eq!(evalt(e, &t), value);
    }

    #[test]
    fn basic_eval() {
        let e = Env::new(&[("a", 2.0), ("b", 1.5)]);
        check(&e, "a + b", 3.5);
        check(&e, "b * 2 + a", 5.0);
        check(&e, "b * 2 + a / 2", 4.0);
    }
}
