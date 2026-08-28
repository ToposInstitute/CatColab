//! ODE analysis of models of the logic of systems of polynomial ODEs.
//!
//! This is used for the the simulation and equations analyses for models in the theory of
//! systems of polynomial ODEs [`th_polynomial_ode_system()`]. However, *all* ODE analyses
//! now factor through this by implementing [`ode::ode_semantics::ODESemantics`]; for further
//! documentation, see there.
//!
//! The interpretation of multicategories as systems of polynomial ODEs is explained in [RFC-0001].
//!
//! [`th_polynomial_ode_system()`]: crate::stdlib::theories
//! [`ode::ode_semantics::ODESemantics`]: crate::stdlib::analyses::ode::ode_semantics::ODESemantics
//! [RFC-0001]: https://next.catcolab.org/rfc/0001

use crate::stdlib::analyses::ode::ODESemanticsGeneralProblemData;
pub use crate::stdlib::analyses::ode::polynomial_ode::v1::polynomial_ode::*;

mod v0;
mod v1;

/// Migration for problem data for polynomial ODE.
pub fn migrate_polynomial_ode_v0_to_v1(
    v0: v0::polynomial_ode::PolynomialODEProblemData,
) -> PolynomialODEProblemData {
    PolynomialODEProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values,
            duration: v0.duration,
        },
        parameter_data: PolynomialODEParameterData { coefficients: v0.coefficients },
    }
}

#[cfg(test)]
mod test {
    use std::rc::Rc;

    use super::*;
    use crate::{
        stdlib::{
            analyses::ode::{ODESemanticsScalarExtension, PolynomialODEAnalysis},
            th_polynomial_ode_system, unsigned_lotka_volterra_dynamics,
        },
        zero::name,
    };
    use expect_test::expect;

    #[test]
    fn polynomial_ode_v0_to_v1_migration() {
        let th = Rc::new(th_polynomial_ode_system());
        let model = unsigned_lotka_volterra_dynamics(th);

        let v0_data = v0::polynomial_ode::PolynomialODEProblemData {
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

        let system = PolynomialODEAnalysis::default().build_system(&model);
        let analysis = v1_data.parameter_data.extend_scalars(system);
        let expected = expect!([r#"
            dA = A - 2 A B
            dB = 1.5 A B + 2 B - 3 B C
            dC = 3 B C - 2 C
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
