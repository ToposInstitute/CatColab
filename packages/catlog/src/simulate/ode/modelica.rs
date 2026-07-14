//! Emit [Modelica](https://modelica.org) source for a polynomial ODE system.
//!
//! This module converts a [`PolynomialSystem`] into a self-contained
//! `model … end …;` block. The resulting Modelica is intentionally minimal:
//! every parameter occurring symbolically in the coefficients is declared as
//! `parameter Real <p> = 1.0;` and every state variable is declared as
//! `Real <x>(start = 1.0);`. Users can either edit the defaults in their
//! preferred Modelica tooling, or pass [`ModelicaOptions`] with concrete
//! starting values and parameter values.
//!
//! The output is consumable by [Rumoca](https://crates.io/crates/rumoca); see
//! the emission tests in `tests/modelica_emission.rs`.
//!
//! # Identifier sanitisation
//!
//! Modelica identifiers must match `[A-Za-z_][A-Za-z0-9_]*`. The helper
//! [`sanitize_identifier`] replaces any other character with `_` and prepends
//! `_` to identifiers that begin with a digit, so callers can pass any
//! `Display` value through [`PolynomialSystem::map_variables`] /
//! `extend_scalars` and then emit.

use std::collections::BTreeSet;
use std::fmt::Display;
use std::ops::Neg;

use indexmap::IndexMap;
use num_traits::One;

use super::polynomial::PolynomialSystem;
use crate::zero::alg::Polynomial;
use crate::zero::rig::{DisplayCoef, Monomial};

/// Settings controlling how a [`PolynomialSystem`] is rendered as Modelica.
#[derive(Clone, Debug)]
pub struct ModelicaOptions {
    /// The Modelica model name (e.g. `"LotkaVolterra"`).
    pub model_name: String,
    /// Default start value for state variables that don't appear in
    /// [`initial_values`](Self::initial_values).
    pub default_initial_value: f32,
    /// Default value for parameters that don't appear in
    /// [`parameter_values`](Self::parameter_values).
    pub default_parameter_value: f32,
    /// Per-variable initial values, keyed by the sanitised Modelica identifier.
    pub initial_values: IndexMap<String, f32>,
    /// Per-parameter values, keyed by the sanitised Modelica identifier.
    pub parameter_values: IndexMap<String, f32>,
    /// If `Some`, emitted as an `annotation(experiment(...))` block.
    pub experiment: Option<ModelicaExperiment>,
}

/// Configuration for a Modelica `experiment` annotation.
#[derive(Clone, Debug)]
pub struct ModelicaExperiment {
    /// Simulation start time.
    pub start_time: f32,
    /// Simulation stop time.
    pub stop_time: f32,
}

impl Default for ModelicaOptions {
    fn default() -> Self {
        Self {
            model_name: "Model".to_string(),
            default_initial_value: 1.0,
            default_parameter_value: 1.0,
            initial_values: IndexMap::new(),
            parameter_values: IndexMap::new(),
            experiment: None,
        }
    }
}

/// Sanitise an arbitrary `Display`able value into a valid Modelica identifier.
///
/// Non-alphanumeric, non-underscore characters become `_`. If the result is
/// empty or starts with a digit, an underscore is prepended.
pub fn sanitize_identifier(raw: impl Display) -> String {
    let s = raw.to_string();
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if c.is_ascii_alphanumeric() || c == '_' {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() || out.starts_with(|c: char| c.is_ascii_digit()) {
        out.insert(0, '_');
    }
    out
}

/// A coefficient or expression that can be embedded inside a Modelica term.
///
/// The implementations on [`f32`] and [`Polynomial`] are enough to render the
/// systems produced by all the ODE analyses in
/// [`crate::stdlib::analyses::ode`]. Custom systems can implement this trait
/// to participate in [`polynomial_system_to_modelica`].
pub trait ToModelicaExpr {
    /// Renders the value as a Modelica expression string.
    fn to_modelica_expr(&self) -> String;
    /// Names of any free parameters appearing in the expression. Used to emit
    /// `parameter Real <p>;` declarations at the top of the model.
    fn collect_parameters(&self, out: &mut BTreeSet<String>);
    /// Whether the expression should be parenthesised when used as a factor in
    /// a product (i.e. if it parses as a sum/difference at the top level).
    fn modelica_needs_parens(&self) -> bool {
        false
    }
}

impl ToModelicaExpr for f32 {
    fn to_modelica_expr(&self) -> String {
        format_f32(*self)
    }
    fn collect_parameters(&self, _: &mut BTreeSet<String>) {}
    fn modelica_needs_parens(&self) -> bool {
        // Negative literals need parens when used as a factor.
        *self < 0.0
    }
}

impl<V, C, E> ToModelicaExpr for Polynomial<V, C, E>
where
    V: Ord + Display,
    C: ToModelicaExpr + DisplayCoef + Clone + PartialEq + One + Neg<Output = C>,
    E: Display + PartialEq + One + Clone + Ord,
{
    fn to_modelica_expr(&self) -> String {
        polynomial_to_modelica(self)
    }
    fn collect_parameters(&self, out: &mut BTreeSet<String>) {
        for m in self.monomials() {
            for (var, _exp) in m.iter() {
                out.insert(sanitize_identifier(var));
            }
        }
    }
    fn modelica_needs_parens(&self) -> bool {
        // A multi-term polynomial parses as a sum at the top level.
        self.monomials().len() > 1
    }
}

/// Renders a [`PolynomialSystem`] as a Modelica `model` block.
///
/// All free parameters referenced by the coefficients are auto-discovered via
/// [`ToModelicaExpr::collect_parameters`] and declared at the top of the
/// model. State variables are taken from the system's keys.
pub fn polynomial_system_to_modelica<V, C, E>(
    sys: &PolynomialSystem<V, C, E>,
    opts: &ModelicaOptions,
) -> String
where
    V: Ord + Display,
    C: ToModelicaExpr + DisplayCoef + Clone + PartialEq + One + Neg<Output = C>,
    E: Display + PartialEq + One + Clone + Ord,
{
    let model_name = if opts.model_name.is_empty() {
        "Model"
    } else {
        opts.model_name.as_str()
    };
    // Validate model name: keep simple — sanitise if necessary.
    let model_name = sanitize_identifier(model_name);

    let mut params: BTreeSet<String> = BTreeSet::new();
    for poly in sys.components.values() {
        for (coef, _m) in poly.terms() {
            coef.collect_parameters(&mut params);
        }
    }

    let mut state_decls = Vec::<String>::new();
    let mut equations = Vec::<String>::new();
    for (var, poly) in sys.components.iter() {
        let id = sanitize_identifier(var);
        let start = opts.initial_values.get(&id).copied().unwrap_or(opts.default_initial_value);
        state_decls.push(format!("  Real {id}(start = {});", format_f32(start)));
        let rhs = polynomial_to_modelica(poly);
        equations.push(format!("  der({id}) = {rhs};"));
    }

    let mut out = String::new();
    out.push_str(&format!("model {model_name}\n"));

    if !params.is_empty() {
        for p in &params {
            let value =
                opts.parameter_values.get(p).copied().unwrap_or(opts.default_parameter_value);
            out.push_str(&format!("  parameter Real {p} = {};\n", format_f32(value)));
        }
        out.push('\n');
    }

    for decl in &state_decls {
        out.push_str(decl);
        out.push('\n');
    }
    out.push_str("equation\n");
    for eq in &equations {
        out.push_str(eq);
        out.push('\n');
    }

    if let Some(exp) = &opts.experiment {
        out.push_str(&format!(
            "  annotation(experiment(StartTime = {}, StopTime = {}));\n",
            format_f32(exp.start_time),
            format_f32(exp.stop_time),
        ));
    }

    out.push_str(&format!("end {model_name};\n"));
    out
}

/// Convenience method: render the system using default options apart from the
/// model name.
impl<V, C, E> PolynomialSystem<V, C, E>
where
    V: Ord + Display,
    C: ToModelicaExpr + DisplayCoef + Clone + PartialEq + One + Neg<Output = C>,
    E: Display + PartialEq + One + Clone + Ord,
{
    /// Render the system as a self-contained Modelica `model` block.
    pub fn to_modelica(&self, opts: &ModelicaOptions) -> String {
        polynomial_system_to_modelica(self, opts)
    }
}

/// Renders an individual polynomial as a Modelica expression.
fn polynomial_to_modelica<V, C, E>(poly: &Polynomial<V, C, E>) -> String
where
    V: Ord + Display,
    C: ToModelicaExpr + DisplayCoef + Clone + PartialEq + One + Neg<Output = C>,
    E: Ord + Display + PartialEq + One,
{
    let fmt_term = |coef: &C, monomial: &Monomial<V, E>| -> String {
        let mon = monomial_to_modelica(monomial);
        if coef.is_one() {
            if mon.is_empty() { "1".to_string() } else { mon }
        } else if *coef == C::one().neg() {
            if mon.is_empty() {
                "-1".to_string()
            } else {
                format!("-{mon}")
            }
        } else {
            let coef_str = if coef.modelica_needs_parens() {
                format!("({})", coef.to_modelica_expr())
            } else {
                coef.to_modelica_expr()
            };
            if mon.is_empty() {
                coef_str
            } else {
                format!("{coef_str}*{mon}")
            }
        }
    };

    let mut iter = poly.terms();
    let Some((coef, monomial)) = iter.next() else {
        return "0".to_string();
    };
    let mut output = fmt_term(coef, monomial);
    for (coef, monomial) in iter {
        if coef.has_negative_sign() {
            output.push_str(" - ");
            output.push_str(&fmt_term(&coef.clone().neg(), monomial));
        } else {
            output.push_str(" + ");
            output.push_str(&fmt_term(coef, monomial));
        }
    }
    output
}

/// Renders a single monomial as a Modelica product. Empty for the unit monomial.
fn monomial_to_modelica<V, E>(monomial: &Monomial<V, E>) -> String
where
    V: Ord + Display,
    E: Display + PartialEq + One,
{
    let mut parts = Vec::<String>::new();
    for (var, exp) in monomial.iter() {
        let id = sanitize_identifier(var);
        if exp.is_one() {
            parts.push(id);
        } else {
            // Modelica's `^` is right-associative and works on reals. For negative
            // exponents we still emit `x^(-2)`.
            let exp_str = exp.to_string();
            if exp_str.starts_with('-') {
                parts.push(format!("{id}^({exp_str})"));
            } else {
                parts.push(format!("{id}^{exp_str}"));
            }
        }
    }
    parts.join("*")
}

/// Formats an `f32` so the output is unambiguous to Modelica's lexer.
fn format_f32(v: f32) -> String {
    if v.is_finite() {
        // `{}` for f32 prints integers without `.`, which Modelica accepts as
        // an integer literal — fine for `Real` contexts since Modelica promotes.
        let s = format!("{v}");
        if s.contains('.') || s.contains('e') || s.contains('E') {
            s
        } else {
            format!("{s}.0")
        }
    } else if v.is_nan() {
        // No NaN literal in Modelica; fall back to 0 with a comment-friendly marker.
        "0.0 /* NaN */".to_string()
    } else if v.is_sign_positive() {
        "Modelica.Constants.inf".to_string()
    } else {
        "-Modelica.Constants.inf".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::zero::rig::Monomial;

    type Parameter = Polynomial<String, f32, i8>;
    type Sys = PolynomialSystem<String, Parameter, i8>;

    fn param(name: &str) -> Parameter {
        Polynomial::generator(name.to_string())
    }

    fn var(name: &str) -> Polynomial<String, Parameter, i8> {
        Polynomial::generator(name.to_string())
    }

    #[test]
    fn sir_modelica() {
        // -β S I, β S I, -γ I, γ I  (SIR)
        let beta = param("beta");
        let gamma = param("gamma");
        let s = var("S");
        let i = var("I");

        let terms = [
            ("S".to_string(), -s.clone() * i.clone() * beta.clone()),
            ("I".to_string(), s.clone() * i.clone() * beta.clone()),
            ("I".to_string(), -i.clone() * gamma.clone()),
            ("R".to_string(), i.clone() * gamma.clone()),
        ];
        let sys: Sys = terms.into_iter().collect();

        let opts = ModelicaOptions {
            model_name: "SIR".to_string(),
            ..Default::default()
        };
        let out = sys.to_modelica(&opts);
        assert!(out.starts_with("model SIR\n"));
        assert!(out.contains("parameter Real beta = 1.0;"));
        assert!(out.contains("parameter Real gamma = 1.0;"));
        assert!(out.contains("Real S(start = 1.0);"));
        assert!(out.contains("Real I(start = 1.0);"));
        assert!(out.contains("Real R(start = 1.0);"));
        assert!(out.contains("der(S) = -beta*I*S;"));
        assert!(out.ends_with("end SIR;\n"));

        let _ = Monomial::<String, i8>::default(); // touch import
    }

    #[test]
    fn sanitization() {
        assert_eq!(sanitize_identifier("foo.bar"), "foo_bar");
        assert_eq!(sanitize_identifier("3x"), "_3x");
        assert_eq!(sanitize_identifier("β"), "_");
        assert_eq!(sanitize_identifier(""), "_");
    }

    #[test]
    fn negative_exponent() {
        // x^{-1} appears in signed stock-flow analyses.
        let m: Monomial<String, i8> = [("x".to_string(), -1i8)].into_iter().collect();
        let s = monomial_to_modelica(&m);
        assert_eq!(s, "x^(-1)");
    }

    #[test]
    fn experiment_annotation() {
        let s = var("x");
        let p = param("k");
        let sys: Sys = [("x".to_string(), -s.clone() * p.clone())].into_iter().collect();
        let opts = ModelicaOptions {
            model_name: "M".to_string(),
            experiment: Some(ModelicaExperiment { start_time: 0.0, stop_time: 5.5 }),
            ..Default::default()
        };
        let out = sys.to_modelica(&opts);
        assert!(out.contains("annotation(experiment(StartTime = 0.0, StopTime = 5.5));"));
    }
}
