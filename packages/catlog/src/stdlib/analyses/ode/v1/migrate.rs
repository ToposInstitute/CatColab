//! Migrations from v0 to v1 for analyses.

use crate::stdlib::analyses::ode::v0::linear_ode::LinearODEProblemData;
use crate::stdlib::analyses::ode::v0::lotka_volterra::LotkaVolterraProblemData;
use crate::stdlib::analyses::ode::v0::mass_action::MassActionProblemData;
use crate::stdlib::analyses::ode::v0::polynomial_ode::PolynomialODEProblemData;
use crate::stdlib::analyses::ode::{
    LinearODEParameterData, LinearODESemantics, LotkaVolterraParameterData, LotkaVolterraSemantics,
    MassActionEquationsConfig, MassActionParameterData, ODESemanticsProblemData,
    PetriNetMassActionSemantics, PolynomialODEParameterData, PolynomialODESemantics,
    StockFlowMassActionSemantics,
};

/// Migration for problem data for linear ODE.
pub fn migrate_linear_ode_v0_to_v1(
    v0: LinearODEProblemData,
) -> ODESemanticsProblemData<LinearODESemantics> {
    let v1: ODESemanticsProblemData<LinearODESemantics> = ODESemanticsProblemData {
        equations_config: (),
        initial_values: v0.initial_values,
        duration: v0.duration,
        parameter_data: LinearODEParameterData { coefficients: v0.coefficients },
    };
    v1
}

/// Migration for problem data for Lotka-Volterra.
pub fn migrate_lotka_volterra_v0_to_v1(
    v0: LotkaVolterraProblemData,
) -> ODESemanticsProblemData<LotkaVolterraSemantics> {
    let v1: ODESemanticsProblemData<LotkaVolterraSemantics> = ODESemanticsProblemData {
        equations_config: (),
        initial_values: v0.initial_values,
        duration: v0.duration,
        parameter_data: LotkaVolterraParameterData {
            interaction_coeffs: v0.interaction_coeffs,
            growth_rates: v0.growth_rates,
        },
    };
    v1
}

/// Migration for problem data for polynomial ODE.
pub fn migrate_polynomial_ode_v0_to_v1(
    v0: PolynomialODEProblemData,
) -> ODESemanticsProblemData<PolynomialODESemantics> {
    let v1: ODESemanticsProblemData<PolynomialODESemantics> = ODESemanticsProblemData {
        equations_config: (),
        initial_values: v0.initial_values,
        duration: v0.duration,
        parameter_data: PolynomialODEParameterData { coefficients: v0.coefficients },
    };
    v1
}

/// Migration for problem data for mass-action.
pub fn migrate_petri_net_mass_action_v0_to_v1(
    v0: MassActionProblemData,
) -> ODESemanticsProblemData<PetriNetMassActionSemantics> {
    let v1: ODESemanticsProblemData<PetriNetMassActionSemantics> = ODESemanticsProblemData {
        equations_config: MassActionEquationsConfig {
            mass_conservation: v0.equations_data.mass_conservation_type,
        },
        initial_values: v0.initial_values,
        duration: v0.duration,
        parameter_data: MassActionParameterData {
            transition_rates: v0.transition_rates,
            transition_consumption_rates: v0.transition_consumption_rates,
            transition_production_rates: v0.transition_production_rates,
            place_consumption_rates: v0.place_consumption_rates,
            place_production_rates: v0.place_production_rates,
        },
    };
    v1
}

/// Migration for problem data for mass-action.
pub fn migrate_stock_flow_mass_action_v0_to_v1(
    v0: MassActionProblemData,
) -> ODESemanticsProblemData<StockFlowMassActionSemantics> {
    let v1: ODESemanticsProblemData<StockFlowMassActionSemantics> = ODESemanticsProblemData {
        equations_config: MassActionEquationsConfig {
            mass_conservation: v0.equations_data.mass_conservation_type,
        },
        initial_values: v0.initial_values,
        duration: v0.duration,
        parameter_data: MassActionParameterData {
            transition_rates: v0.transition_rates,
            transition_consumption_rates: v0.transition_consumption_rates,
            transition_production_rates: v0.transition_production_rates,
            place_consumption_rates: v0.place_consumption_rates,
            place_production_rates: v0.place_production_rates,
        },
    };
    v1
}

#[cfg(test)]
mod test {
    use std::rc::Rc;

    use super::*;
    use crate::{
        stdlib::{
            analyses::ode::{
                LinearODEAnalysis, LotkaVolterraAnalysis, ODESemanticsAnalysis,
                PolynomialODEAnalysis,
            },
            negative_feedback, th_polynomial_ode_system, th_signed_category,
            unsigned_lotka_volterra_dynamics,
        },
        zero::name,
    };
    use expect_test::expect;

    #[test]
    fn linear_ode_v0_to_v1_migration() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);

        let v0_data = LinearODEProblemData {
            coefficients: [(name("positive"), 3.0), (name("negative"), 2.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let v1_data = migrate_linear_ode_v0_to_v1(v0_data);

        let sys = LinearODEAnalysis::default().build_system(&model);
        let analysis = v1_data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = -2 y
            dy = 3 x
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    #[test]
    fn lotka_volterra_v0_to_v1_migration() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);

        let v0_data = LotkaVolterraProblemData {
            interaction_coeffs: [(name("positive"), 1.0), (name("negative"), 1.0)]
                .into_iter()
                .collect(),
            growth_rates: [(name("x"), 2.0), (name("y"), -1.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let v1_data = migrate_lotka_volterra_v0_to_v1(v0_data);

        let sys = LotkaVolterraAnalysis::default().build_system(&model);
        let analysis = v1_data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = 2 x - x y
            dy = x y - y
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    #[test]
    fn polynomial_ode_v0_to_v1_migration() {
        let th = Rc::new(th_polynomial_ode_system());
        let model = unsigned_lotka_volterra_dynamics(th);

        let v0_data = PolynomialODEProblemData {
            coefficients: [
                (name("A_growth"), 1.0),
                (name("B_growth"), 2.0),
                (name("C_growth"), -2.0),
                (name("AB_interaction"), 1.5),
                (name("BA_interaction"), -2.0),
                (name("BC_interaction"), 3.0),
                (name("CB_interaction"), -3.0),
            ]
            .into_iter()
            .collect(),
            initial_values: [(name("a"), 1.0), (name("b"), 1.0), (name("c"), 1.0)]
                .into_iter()
                .collect(),
            duration: 10.0,
        };

        let v1_data = migrate_polynomial_ode_v0_to_v1(v0_data);

        let sys = PolynomialODEAnalysis::default().build_system(&model);
        let analysis = v1_data.extend_scalars(sys);
        let expected = expect!([r#"
            dA = A - 2 A B
            dB = 1.5 A B + 2 B - 3 B C
            dC = 3 B C - 2 C
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    // TODO: mass-action migration tests.
}
