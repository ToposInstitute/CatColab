//! Modelica source code export for ODE analyses.
//!
//! This module is a thin wrapper over [`crate::simulate::ode::modelica`] that
//! takes the symbolic [`PolynomialSystem`] produced by an ODE analysis and
//! relabels its variables/parameters using closures supplied by the caller
//! (typically `catlog-wasm` so labels can be derived from the model's name
//! namespaces), then emits a self-contained Modelica `model` block.
//!
//! See [`crate::simulate::ode::modelica::ModelicaOptions`] for emission
//! controls.

use std::fmt::Display;
use std::ops::Add;

use crate::simulate::ode::modelica::{ModelicaOptions, polynomial_system_to_modelica};
use crate::simulate::ode::polynomial::PolynomialSystem;
use crate::zero::QualifiedName;
use crate::zero::alg::Polynomial;

use super::Parameter;

/// Re-labels and renders a symbolic polynomial ODE system as Modelica.
///
/// The input system has `QualifiedName` variables and [`Parameter<X>`]
/// coefficients (a polynomial in some parameter identifier `X`). The output is
/// a Modelica source string in which both variables and parameters have been
/// renamed via the supplied label functions, and then sanitised into valid
/// Modelica identifiers by [`polynomial_system_to_modelica`].
pub fn render_polynomial_system_as_modelica<X, E, FOb, FParam>(
    sys: PolynomialSystem<QualifiedName, Parameter<X>, E>,
    ob_label: FOb,
    param_label: FParam,
    opts: &ModelicaOptions,
) -> String
where
    X: Clone + Ord,
    E: Clone + Ord + Add<Output = E> + num_traits::One + std::fmt::Display + PartialEq,
    FOb: Fn(&QualifiedName) -> String,
    FParam: Fn(&X) -> String,
{
    let relabelled: PolynomialSystem<String, Polynomial<String, f32, i8>, E> = sys
        .map_variables(ob_label)
        .extend_scalars(|coef| coef.map_variables(&param_label));
    polynomial_system_to_modelica(&relabelled, opts)
}

/// Re-labels and renders a symbolic polynomial ODE system as Modelica, where
/// the parameter type is the same as the variable type (a `QualifiedName`).
///
/// This is the common case for Lotka–Volterra / linear-ODE / generic
/// polynomial-ODE analyses, where parameter identifiers are just
/// `QualifiedName`s.
pub fn render_named_polynomial_system_as_modelica<E, FOb, FParam>(
    sys: PolynomialSystem<QualifiedName, Parameter<QualifiedName>, E>,
    ob_label: FOb,
    param_label: FParam,
    opts: &ModelicaOptions,
) -> String
where
    E: Clone + Ord + Add<Output = E> + num_traits::One + Display + PartialEq,
    FOb: Fn(&QualifiedName) -> String,
    FParam: Fn(&QualifiedName) -> String,
{
    render_polynomial_system_as_modelica(sys, ob_label, param_label, opts)
}

#[cfg(test)]
mod tests {
    use std::rc::Rc;

    use super::*;
    use crate::stdlib;
    use crate::stdlib::analyses::ode::{
        MassConservationType, PetriNetMassActionAnalysis, PolynomialODEAnalysis, RateGranularity,
        StockFlowMassActionAnalysis,
    };
    use crate::zero::QualifiedName;

    fn default_label(name: &QualifiedName) -> String {
        name.to_string()
    }

    fn flow_label(f: &crate::stdlib::analyses::ode::FlowParameter) -> String {
        f.to_string()
    }

    #[test]
    fn petri_balanced_modelica() {
        let th = Rc::new(stdlib::theories::th_sym_monoidal_category());
        let model = stdlib::models::catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default()
            .build_system(&model, MassConservationType::Balanced);

        let opts = ModelicaOptions {
            model_name: "Catalysis".into(),
            ..Default::default()
        };
        let out = render_polynomial_system_as_modelica(sys, default_label, flow_label, &opts);

        assert!(out.contains("model Catalysis"));
        assert!(out.contains("parameter Real f = 1.0;"));
        assert!(out.contains("Real x(start = 1.0);"));
        assert!(out.contains("Real y(start = 1.0);"));
        assert!(out.contains("Real c(start = 1.0);"));
        assert!(out.contains("der(x) = -f*c*x;"));
        assert!(out.contains("der(y) = f*c*x;"));
        assert!(out.contains("der(c) = 0;"));
        assert!(out.ends_with("end Catalysis;\n"));
    }

    #[test]
    fn petri_unbalanced_modelica() {
        let th = Rc::new(stdlib::theories::th_sym_monoidal_category());
        let model = stdlib::models::catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default()
            .build_system(&model, MassConservationType::Unbalanced(RateGranularity::PerTransition));

        let opts = ModelicaOptions {
            model_name: "Cat".into(),
            ..Default::default()
        };
        let out = render_polynomial_system_as_modelica(sys, default_label, flow_label, &opts);
        // "Outgoing(f)" → "Outgoing_f_"
        assert!(out.contains("parameter Real Outgoing_f_"));
        assert!(out.contains("parameter Real Incoming_f_"));
    }

    #[test]
    fn stock_flow_modelica() {
        let th = Rc::new(stdlib::theories::th_category_links());
        let model = stdlib::models::backward_link(th);
        let sys = StockFlowMassActionAnalysis::default()
            .build_system(&model, MassConservationType::Balanced);

        let opts = ModelicaOptions {
            model_name: "SF".into(),
            ..Default::default()
        };
        let out = render_polynomial_system_as_modelica(sys, default_label, flow_label, &opts);
        assert!(out.contains("parameter Real f = 1.0;"));
        assert!(out.contains("der(x) = -f*x*y;"));
        assert!(out.contains("der(y) = f*x*y;"));
    }

    #[test]
    fn polynomial_ode_modelica() {
        let th = Rc::new(stdlib::theories::th_polynomial_ode_system());
        let model = stdlib::models::lotka_volterra_dynamics(th);
        let sys = PolynomialODEAnalysis::default().build_system(&model);

        let opts = ModelicaOptions {
            model_name: "LV".into(),
            ..Default::default()
        };
        let out = render_polynomial_system_as_modelica(sys, default_label, default_label, &opts);

        // Three state vars A, B, C
        assert!(out.contains("Real A(start = 1.0);"));
        assert!(out.contains("Real B(start = 1.0);"));
        assert!(out.contains("Real C(start = 1.0);"));
        // Growth-rate parameters present
        assert!(out.contains("parameter Real A_growth"));
        assert!(out.contains("parameter Real BA_interaction"));
    }
}
