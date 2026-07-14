//! Auxiliary structs and glue code for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::simulate::ode::PolynomialSystem;
use catlog::simulate::ode::modelica::{ModelicaExperiment, ModelicaOptions};
use catlog::stdlib::analyses::ode;
use catlog::stdlib::analyses::ode::modelica_export::render_polynomial_system_as_modelica;
use catlog::zero::QualifiedName;

use super::latex::{LatexEquations, latex_mor_names, latex_mor_names_mass_action, latex_ob_names};
use super::model::DblModel;
use super::result::JsResult;

/// The result of an ODE analysis, containing the solution when successful.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResult(pub JsResult<ode::ODESolution, String>);

/// The result of an ODE analysis including equations in LaTeX with substitutions.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResultWithEquations {
    /// The result of the simulation.
    pub solution: ODEResult,
    /// The equations in LaTeX format with parameters substituted.
    #[serde(rename = "latexEquations")]
    pub latex_equations: LatexEquations,
}

/// The analysis data for polynomial ODE equations.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct PolynomialODEEquationsData {
    #[serde(rename = "trivialData")]
    trivial_data: bool,
}

/// Generates the PolynomialSystem for the systems of polynomial ODEs.
fn polynomial_ode_system(
    model: &DblModel,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<QualifiedName>, i8>, String> {
    let realised_model = model.modal_nonunital()?;
    let analysis = ode::PolynomialODEAnalysis::default();
    Ok(analysis.build_system(realised_model))
}

/// Generates equations for the system of polynomial ODEs.
pub(crate) fn polynomial_ode_equations(
    model: &DblModel,
    _data: PolynomialODEEquationsData,
) -> Result<LatexEquations, String> {
    let sys = polynomial_ode_system(model);
    let equations = sys?
        .map_variables(latex_ob_names(model))
        .extend_scalars(|param| param.map_variables(latex_mor_names(model)))
        .to_latex_equations();
    Ok(LatexEquations(equations))
}

/// Simulates mass-action ODEs.
pub(crate) fn polynomial_ode_simulation(
    model: &DblModel,
    data: ode::PolynomialODEProblemData,
) -> Result<ODEResultWithEquations, String> {
    let sys = polynomial_ode_system(model);
    let sys_extended_scalars = ode::extend_polynomial_ode_scalars(sys?, &data);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_ob_names(model)).to_latex_equations();
    let analysis = ode::polynomial_ode_analysis(sys_extended_scalars, data);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations: LatexEquations(latex_equations),
    })
}

/// The mass-action analysis is currently implemented for Petri nets and stock-flow
/// diagrams, and we can avoid some code reduplication by making this explicit.
pub enum MassActionAnalysisLogic {
    /// The modal theory of Petri nets.
    PetriNet,
    /// The discrete tabulator theory of stock-flow diagrams.
    StockFlow,
}

/// Generates the PolynomialSystem for mass-action dynamics.
fn mass_action_system(
    model: &DblModel,
    mass_conservation_type: ode::MassConservationType,
    logic: MassActionAnalysisLogic,
) -> Result<PolynomialSystem<QualifiedName, ode::Parameter<ode::FlowParameter>, i8>, String> {
    match logic {
        MassActionAnalysisLogic::PetriNet => {
            let realised_model = model.modal_unital()?;
            let analysis = ode::PetriNetMassActionAnalysis::default();
            Ok(analysis.build_system(realised_model, mass_conservation_type))
        }
        MassActionAnalysisLogic::StockFlow => {
            let realised_model = model.discrete_tab()?;
            let analysis = ode::StockFlowMassActionAnalysis::default();
            Ok(analysis.build_system(realised_model, mass_conservation_type))
        }
    }
}

/// The analysis data for mass-action equations.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MassActionEquationsData {
    /// The mass-conservation type.
    #[serde(rename = "massConservationType")]
    pub mass_conservation_type: ode::MassConservationType,
}

/// Generates mass-action equations for the system.
pub(crate) fn mass_action_equations(
    model: &DblModel,
    data: MassActionEquationsData,
    logic: MassActionAnalysisLogic,
) -> Result<LatexEquations, String> {
    let sys = mass_action_system(model, data.mass_conservation_type, logic);
    let equations = sys?
        .map_variables(latex_ob_names(model))
        .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(model)))
        .to_latex_equations();
    Ok(LatexEquations(equations))
}

/// Simulates mass-action ODEs.
pub(crate) fn mass_action_simulation(
    model: &DblModel,
    data: ode::MassActionProblemData,
    logic: MassActionAnalysisLogic,
) -> Result<ODEResultWithEquations, String> {
    let sys = mass_action_system(model, data.mass_conservation_type, logic);
    let sys_extended_scalars = ode::extend_mass_action_scalars(sys?, &data);
    let latex_equations =
        sys_extended_scalars.map_variables(latex_ob_names(model)).to_latex_equations();
    let analysis = ode::into_mass_action_analysis(sys_extended_scalars, data);
    let solution = analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
    Ok(ODEResultWithEquations {
        solution: ODEResult(solution.into()),
        latex_equations: LatexEquations(latex_equations),
    })
}

// ---------------------------------------------------------------------------
// Modelica export
// ---------------------------------------------------------------------------

/// Data driving the Modelica code-export analysis.
///
/// All fields apart from `modelName` are optional. When omitted, parameters
/// and state variables are emitted with default values of `1.0`. The frontend
/// surfaces only the model name and the experiment time span; consumers can
/// then edit the generated parameters in their preferred Modelica tooling.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelicaExportData {
    /// The Modelica model name (e.g. `"LotkaVolterra"`).
    #[serde(rename = "modelName")]
    pub model_name: String,
    /// Simulation start time written into the `experiment` annotation.
    #[serde(rename = "startTime")]
    pub start_time: f32,
    /// Simulation stop time written into the `experiment` annotation.
    #[serde(rename = "stopTime")]
    pub stop_time: f32,
}

impl Default for ModelicaExportData {
    fn default() -> Self {
        Self {
            model_name: "Model".to_string(),
            start_time: 0.0,
            stop_time: 10.0,
        }
    }
}

/// Modelica source emitted by an export analysis, plus the model name.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelicaResult {
    /// Sanitised Modelica model name actually emitted (matches the closing
    /// `end <name>;`). May differ from the input if the user supplied an
    /// identifier that needed cleanup.
    #[serde(rename = "modelName")]
    pub model_name: String,
    /// The Modelica source code.
    pub source: String,
}

fn modelica_options(data: &ModelicaExportData) -> ModelicaOptions {
    ModelicaOptions {
        model_name: data.model_name.clone(),
        experiment: Some(ModelicaExperiment {
            start_time: data.start_time,
            stop_time: data.stop_time,
        }),
        ..Default::default()
    }
}

/// Closure that turns a `QualifiedName` into a Modelica identifier using the
/// model's object name namespace.
fn modelica_ob_names(model: &DblModel) -> impl Fn(&QualifiedName) -> String {
    |id: &QualifiedName| model.ob_namespace.label_string(id)
}

/// Closure that turns a `QualifiedName` into a Modelica identifier using the
/// model's morphism name namespace (with a fallback for unlabelled morphisms).
fn modelica_mor_names(model: &DblModel) -> impl Fn(&QualifiedName) -> String {
    move |id: &QualifiedName| {
        if let Some(label) = model.mor_namespace.label(id) {
            label.to_string()
        } else if let Some((dom, cod)) = model.mor_generator_dom_cod_label_strings(id) {
            format!("{dom}_to_{cod}")
        } else {
            id.to_string()
        }
    }
}

/// Closure that turns a [`ode::FlowParameter`] into a Modelica identifier.
fn modelica_mor_names_mass_action(model: &DblModel) -> impl Fn(&ode::FlowParameter) -> String {
    let transition_label = |t: &QualifiedName| -> String {
        if let Some(label) = model.mor_namespace.label(t) {
            label.to_string()
        } else if let Some((dom, cod)) = model.mor_generator_dom_cod_label_strings(t) {
            format!("{dom}_to_{cod}")
        } else {
            t.to_string()
        }
    };
    move |p: &ode::FlowParameter| match p {
        ode::FlowParameter::Balanced { transition } => {
            format!("r_{}", transition_label(transition))
        }
        ode::FlowParameter::Unbalanced { direction, parameter } => match (direction, parameter) {
            (ode::Direction::IncomingFlow, ode::RateParameter::PerTransition { transition }) => {
                format!("rho_{}", transition_label(transition))
            }
            (ode::Direction::OutgoingFlow, ode::RateParameter::PerTransition { transition }) => {
                format!("kappa_{}", transition_label(transition))
            }
            (ode::Direction::IncomingFlow, ode::RateParameter::PerPlace { transition, place }) => {
                format!(
                    "rho_{}__{}",
                    transition_label(transition),
                    model.ob_namespace.label_string(place)
                )
            }
            (ode::Direction::OutgoingFlow, ode::RateParameter::PerPlace { transition, place }) => {
                format!(
                    "kappa_{}__{}",
                    transition_label(transition),
                    model.ob_namespace.label_string(place)
                )
            }
        },
    }
}

fn build_modelica_result(data: &ModelicaExportData, source: String) -> ModelicaResult {
    let model_name = catlog::simulate::ode::modelica::sanitize_identifier(data.model_name.as_str());
    let model_name = if model_name.is_empty() {
        "Model".to_string()
    } else {
        model_name
    };
    ModelicaResult { model_name, source }
}

/// Emit Modelica source for a mass-action analysis (Petri net or stock-flow).
pub(crate) fn mass_action_modelica(
    model: &DblModel,
    mass_conservation_type: ode::MassConservationType,
    export: ModelicaExportData,
    logic: MassActionAnalysisLogic,
) -> Result<ModelicaResult, String> {
    let sys = mass_action_system(model, mass_conservation_type, logic)?;
    let opts = modelica_options(&export);
    let source = render_polynomial_system_as_modelica(
        sys,
        modelica_ob_names(model),
        modelica_mor_names_mass_action(model),
        &opts,
    );
    Ok(build_modelica_result(&export, source))
}

/// Emit Modelica source for a generic polynomial-ODE analysis.
pub(crate) fn polynomial_ode_modelica(
    model: &DblModel,
    export: ModelicaExportData,
) -> Result<ModelicaResult, String> {
    let sys = polynomial_ode_system(model)?;
    let opts = modelica_options(&export);
    let source = render_polynomial_system_as_modelica(
        sys,
        modelica_ob_names(model),
        modelica_mor_names(model),
        &opts,
    );
    Ok(build_modelica_result(&export, source))
}

/// Emit Modelica source for the Lotka–Volterra analysis on a signed graph.
pub(crate) fn lotka_volterra_modelica(
    model: &DblModel,
    export: ModelicaExportData,
) -> Result<ModelicaResult, String> {
    use catlog::one::Path;
    use catlog::zero::name;
    let (sys, _) = ode::SignedCoefficientBuilder::new(name("Object"))
        .add_positive(Path::Id(name("Object")))
        .add_negative(name("Negative").into())
        .lotka_volterra_system(model.discrete()?);
    let opts = modelica_options(&export);
    let source = render_polynomial_system_as_modelica(
        sys,
        modelica_ob_names(model),
        modelica_mor_names(model),
        &opts,
    );
    Ok(build_modelica_result(&export, source))
}

/// Emit Modelica source for the linear ODE analysis on a signed graph.
pub(crate) fn linear_ode_modelica(
    model: &DblModel,
    export: ModelicaExportData,
) -> Result<ModelicaResult, String> {
    use catlog::one::Path;
    use catlog::zero::name;
    let (sys, _) = ode::SignedCoefficientBuilder::new(name("Object"))
        .add_positive(Path::Id(name("Object")))
        .add_negative(name("Negative").into())
        .linear_ode_system(model.discrete()?);
    let opts = modelica_options(&export);
    let source = render_polynomial_system_as_modelica(
        sys,
        modelica_ob_names(model),
        modelica_mor_names(model),
        &opts,
    );
    Ok(build_modelica_result(&export, source))
}
