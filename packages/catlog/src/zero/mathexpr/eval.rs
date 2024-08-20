use super::{compiler::Compiled, syntax::*, Prog};

/// A mapping of free variables to values
pub trait Env {
    /// The type of variables that can be looked up
    type Var;

    /// The function that allows lookup of a variable
    fn lookup(&self, t: &Self::Var) -> f32;
}

pub(super) fn eval<E: Env>(e: &E, t: &Compiled<E::Var>) -> f32 {
    match t {
        Compiled::Sum(ts) => {
            ts.iter().map(|(s, t)| (s, eval(e, t))).fold(0.0, |acc, (s, v)| match s {
                Sign::Plus => acc + v,
                Sign::Minus => acc - v,
            })
        }
        Compiled::Product(ts) => {
            ts.iter().map(|(s, t)| (s, eval(e, t))).fold(1.0, |acc, (s, v)| match s {
                LogSign::Multiply => acc * v,
                LogSign::Divide => acc / v,
            })
        }
        Compiled::Const(x) => *x,
        Compiled::Var(t) => e.lookup(t),
    }
}

/// Evaluate a checked expression in with values for free variables given by `e`
pub fn run<E: Env>(e: &E, expr: &Prog<E::Var>) -> f32 {
    eval(e, &expr.0)
}

/// An example environment where variables are indices into an array of f32s
pub struct VecEnv {
    values: Vec<f32>,
}

impl VecEnv {
    /// Construct a new VecEnv with given values
    pub fn new(values: Vec<f32>) -> Self {
        Self { values }
    }
}

impl Env for VecEnv {
    type Var = usize;

    fn lookup(&self, t: &usize) -> f32 {
        self.values[*t]
    }
}

#[cfg(test)]
mod test {
    use super::super::compiler;

    use super::{run, VecEnv};

    fn check(e: &[(&str, f32)], src: &str, value: f32) {
        let ctx = compiler::Context::new(
            &e.iter().enumerate().map(|(i, (n, _))| (*n, i)).collect::<Vec<(&str, usize)>>(),
        );
        let p = compiler::compile(&ctx, src).unwrap();
        let env = VecEnv::new(e.iter().map(|(_, x)| *x).collect());

        assert_eq!(run(&env, &p), value);
    }

    #[test]
    fn basic_eval() {
        let e = &[("a", 2.0), ("b", 1.5)];
        check(e, "a + b", 3.5);
        check(e, "b * 2 + a", 5.0);
        check(e, "b * 2 + a / 2", 4.0);
    }
}
