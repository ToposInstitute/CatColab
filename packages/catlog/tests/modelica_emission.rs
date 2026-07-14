//! Modelica emission tests: emit Modelica from each ODE flavour and check
//! that the result parses and balance-compiles via [`rumoca`].
//!
//! These tests give us machine-checked confidence that the Modelica we emit
//! is syntactically and structurally well-formed.
//!
//! Rumoca is a dev-only dependency, so these tests never ship with the WASM
//! bundle.
//!
//! Each test:
//!   1. Builds a representative ODE model.
//!   2. Calls [`catlog::stdlib::analyses::ode::modelica_export::
//!      render_polynomial_system_as_modelica`].
//!   3. Feeds the resulting source to `rumoca::Compiler::new().model(...)
//!      .compile_str(...)` and asserts that it succeeds with at least one
//!      state variable in the produced DAE.

use std::rc::Rc;

use catlog::simulate::ode::modelica::ModelicaOptions;
use catlog::stdlib::{
    self,
    analyses::ode::{
        FlowParameter, MassConservationType, PetriNetMassActionAnalysis, PolynomialODEAnalysis,
        StockFlowMassActionAnalysis, modelica_export::render_polynomial_system_as_modelica,
    },
};
use catlog::zero::QualifiedName;

fn ob_label(name: &QualifiedName) -> String {
    name.to_string()
}

fn flow_label(p: &FlowParameter) -> String {
    p.to_string()
}

fn name_label(p: &QualifiedName) -> String {
    p.to_string()
}

fn assert_compiles(model_name: &str, source: &str) {
    let result = rumoca::Compiler::new().model(model_name).compile_str(source, "test.mo");
    assert!(
        result.is_ok(),
        "Rumoca failed to compile generated Modelica for {model_name}:\n--- source ---\n{source}\n--- error ---\n{:?}",
        result.err()
    );
    let result = result.unwrap();
    assert!(
        !result.dae.x.is_empty(),
        "Compiled DAE for {model_name} should have at least one state variable\n--- source ---\n{source}"
    );
}

#[test]
fn petri_balanced_compiles() {
    let th = Rc::new(stdlib::theories::th_sym_monoidal_category());
    let model = stdlib::models::catalyzed_reaction(th);
    let sys =
        PetriNetMassActionAnalysis::default().build_system(&model, MassConservationType::Balanced);
    let opts = ModelicaOptions {
        model_name: "Catalysis".into(),
        ..Default::default()
    };
    let source = render_polynomial_system_as_modelica(sys, ob_label, flow_label, &opts);
    assert_compiles("Catalysis", &source);
}

#[test]
fn petri_unbalanced_compiles() {
    use catlog::stdlib::analyses::ode::RateGranularity;
    let th = Rc::new(stdlib::theories::th_sym_monoidal_category());
    let model = stdlib::models::catalyzed_reaction(th);
    let sys = PetriNetMassActionAnalysis::default()
        .build_system(&model, MassConservationType::Unbalanced(RateGranularity::PerTransition));
    let opts = ModelicaOptions {
        model_name: "CatUnbal".into(),
        ..Default::default()
    };
    let source = render_polynomial_system_as_modelica(sys, ob_label, flow_label, &opts);
    assert_compiles("CatUnbal", &source);
}

#[test]
fn stock_flow_balanced_compiles() {
    let th = Rc::new(stdlib::theories::th_category_links());
    let model = stdlib::models::backward_link(th);
    let sys =
        StockFlowMassActionAnalysis::default().build_system(&model, MassConservationType::Balanced);
    let opts = ModelicaOptions {
        model_name: "StockFlow".into(),
        ..Default::default()
    };
    let source = render_polynomial_system_as_modelica(sys, ob_label, flow_label, &opts);
    assert_compiles("StockFlow", &source);
}

#[test]
fn polynomial_ode_compiles() {
    let th = Rc::new(stdlib::theories::th_polynomial_ode_system());
    let model = stdlib::models::lotka_volterra_dynamics(th);
    let sys = PolynomialODEAnalysis::default().build_system(&model);
    let opts = ModelicaOptions {
        model_name: "PolyODE".into(),
        ..Default::default()
    };
    let source = render_polynomial_system_as_modelica(sys, ob_label, name_label, &opts);
    assert_compiles("PolyODE", &source);
}

#[test]
fn lotka_volterra_compiles() {
    use catlog::one::{Path, QualifiedPath};
    use catlog::stdlib::analyses::ode::SignedCoefficientBuilder;
    use catlog::zero::name;

    let th = Rc::new(stdlib::theories::th_signed_category());
    let model = stdlib::models::negative_feedback(th);
    let builder = SignedCoefficientBuilder::<QualifiedName, QualifiedPath>::new(name("Object"))
        .add_positive(Path::Id(name("Object")))
        .add_negative(Path::single(name("Negative")));
    let (sys, _) = builder.lotka_volterra_system(&model);
    let opts = ModelicaOptions {
        model_name: "LV".into(),
        ..Default::default()
    };
    let source = render_polynomial_system_as_modelica(sys, ob_label, name_label, &opts);
    assert_compiles("LV", &source);
}

#[test]
fn linear_ode_compiles() {
    use catlog::one::{Path, QualifiedPath};
    use catlog::stdlib::analyses::ode::SignedCoefficientBuilder;
    use catlog::zero::name;

    let th = Rc::new(stdlib::theories::th_signed_category());
    let model = stdlib::models::negative_feedback(th);
    let builder = SignedCoefficientBuilder::<QualifiedName, QualifiedPath>::new(name("Object"))
        .add_positive(Path::Id(name("Object")))
        .add_negative(Path::single(name("Negative")));
    let (sys, _) = builder.linear_ode_system(&model);
    let opts = ModelicaOptions {
        model_name: "LinODE".into(),
        ..Default::default()
    };
    let source = render_polynomial_system_as_modelica(sys, ob_label, name_label, &opts);
    assert_compiles("LinODE", &source);
}
