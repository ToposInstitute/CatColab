//! Kuramoto model of synchronization of coupled oscillators.
//!
//! The first-order and second-order Kuramoto models are both described in
//! Section 2.1 of [Nitzbon et al 2017](crate::refs::NitzbonNetworkStability),
//! among other sources.

use nalgebra::{DMatrix, DVector};

use super::ODESystem;

/// Differential order of a Kuramoto system.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KuramotoOrder {
    /// First-order Kuramoto system.
    First,

    /// Second-order Kuramoto system.
    ///
    /// Reduced to a first-order ODE system by introducing extra state variables
    /// for the angular frequencies `ω_i`.
    Second,
}

/// Kuramoto system of ODEs.
///
/// The state variables of the system are the phase angles `ϕ_i` and, in the
/// second-order case, also the angular frequencies `ω_i`. The notation here
/// follows [Nitzbon et al 2017](crate::refs::NitzbonNetworkStability).
#[derive(Clone, Debug, PartialEq)]
pub struct KuramotoSystem {
    /// Differential order of the system.
    pub order: KuramotoOrder,

    /// Coupling coefficients `K_{i,j}` between the oscillators (nonnegative).
    pub coupling_coeffs: DMatrix<f32>,

    /// Damping coefficients `α_i` (nonnegative).
    pub damping_coeffs: DVector<f32>,

    /// Forcing parameter `P_i` (arbitrary sign).
    ///
    /// In the first-order case, these constant offsets are the *inherent
    /// frequencies* of the oscillators, but in the second-order case, their
    /// relationship to the inherent frequencies is more complicated; see
    /// [Nishikawa & Motter
    /// 2015](https://doi.org/10.1088/1367-2630/17/1/015012).
    pub forcing_params: DVector<f32>,
}

impl KuramotoSystem {
    /// Constructs a homogeneous Kuramoto system on the complete graph.
    pub fn fully_connected_homogeneous(order: KuramotoOrder, forcing_params: DVector<f32>) -> Self {
        let n = forcing_params.len();
        let mut coupling_coeffs = DMatrix::from_element(n, n, 1.0);
        for i in 0..n {
            coupling_coeffs[(i, i)] = 0.0;
        }
        let damping_coeffs = DVector::from_element(n, 1.0);
        Self {
            order,
            coupling_coeffs,
            damping_coeffs,
            forcing_params,
        }
    }
}

impl ODESystem for KuramotoSystem {
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        match self.order {
            KuramotoOrder::First => {
                let n = x.len();
                for i in 0..n {
                    let mut rhs = self.forcing_params[i];
                    for j in 0..n {
                        rhs -= self.coupling_coeffs[(i, j)] * (x[i] - x[j]).sin();
                    }
                    dx[i] = rhs / self.damping_coeffs[i];
                }
            }
            KuramotoOrder::Second => {
                let n = x.len() / 2;
                for i in 0..n {
                    dx[i] = x[i + n];
                    let mut rhs = self.forcing_params[i] - self.damping_coeffs[i] * x[i + n];
                    for j in 0..n {
                        rhs -= self.coupling_coeffs[(i, j)] * (x[i] - x[j]).sin();
                    }
                    dx[i + n] = rhs;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::f32::consts::{FRAC_PI_2, FRAC_PI_4, TAU as TWO_PI};

    use super::super::{ODEProblem, textplot_mapped_ode_result};
    use super::*;

    fn angular_distance(t1: f32, t2: f32) -> f32 {
        let d1 = (t1 - t2) % TWO_PI;
        let d2 = TWO_PI - d1;
        d1.min(d2)
    }

    #[test]
    fn first_order_kuramoto() {
        let sys = KuramotoSystem::fully_connected_homogeneous(
            KuramotoOrder::First,
            DVector::from_element(3, 10.0 * TWO_PI),
        );
        let x0 = DVector::from_column_slice(&[-FRAC_PI_2, 0.0, FRAC_PI_4]);
        let problem = ODEProblem::new(sys, x0).end_time(1.5);

        // Check synchronization: convergence of angular distances to zero.
        let result = problem.solve_rk4(0.001).unwrap();
        let expected = expect![[r#"
            ⡳⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ 2.4
            ⠄⠹⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠘⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠘⢦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠈⢧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⢳⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⣁⠀⠀⠀⠀⠀⠀⠳⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠌⠳⣄⠀⠀⠀⠀⠀⠹⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠘⢦⡀⠀⠀⠀⠀⠙⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠙⢦⠀⠀⠀⠀⠈⢧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠳⣄⠀⠀⠀⠀⠳⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⠀⠈⠳⡄⠀⠀⠀⠙⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠘⢦⡀⠀⠀⠈⠳⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢦⡀⠀⠀⠙⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠦⣄⠀⠀⠙⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠳⢤⡀⠀⠙⠲⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠲⢤⣀⠈⠙⠦⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⠲⢤⣀⠉⠒⠦⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠓⠲⠤⢭⣙⣒⡦⠤⣄⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠙⠒⠚⠛⠻⠷⠶⠶⠶⠦⣤⣤⣤⣤⣤⡀
            ⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠁ 0.0
            0.0                                            1.5
        "#]];
        expected.assert_eq(&textplot_mapped_ode_result(
            &problem,
            &result,
            |_i| true,
            |x, i| angular_distance(x[i], x[0]),
        ));
    }

    #[test]
    fn second_order_kuramoto() {
        let sys = KuramotoSystem::fully_connected_homogeneous(
            KuramotoOrder::Second,
            DVector::from_column_slice(&[1.0, -1.0, 1.0]),
        );
        let x0 = DVector::from_column_slice(&[-FRAC_PI_2, 0.0, FRAC_PI_4, 0.0, 0.0, 0.0]);
        let problem = ODEProblem::new(sys, x0).end_time(10.0);

        // These initial and parameter values are in the basin of attraction for
        // the steady state with constant differences between phase angles.
        let result = problem.solve_rk4(0.01).unwrap();
        let expected = expect![[r#"
            ⡙⢦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ 2.4
            ⠄⠈⢧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⢸⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠝⢦⠀⠀⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠈⣆⠀⢸⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠸⡀⠀⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⢧⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠸⡄⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⢇⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⢸⡀⠈⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⡇⠀⢹⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⠞⠉⠀⠀⠈⠙⠲⢤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⣀⣀⣀⣀⡀⠀⠀⠀
            ⡉⠉⠉⠉⠉⢹⠉⠉⣏⠉⠉⠉⠉⠉⠉⠉⠉⢉⡟⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠙⠛⠻⠭⠭⠟⠛⠛⠋⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠁
            ⠄⠀⠀⠀⠀⠈⡇⠀⠸⡄⠀⠀⠀⠀⠀⠀⣠⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⢱⠀⠀⠱⡀⠀⠀⠀⢀⡴⠃⠀⠀⠀⠀⣀⡤⠤⠤⢤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠈⡆⠀⠀⠙⢤⣀⡤⠊⠀⠀⠀⠀⣠⠞⠁⠀⠀⠀⠀⠈⠙⠒⠤⣄⣀⠀⠀⠀⠀⠀⢀⣀⣀⣀⡤⠤⠤⠤⠤⠤⠤⠤⠤⠄
            ⠄⠀⠀⠀⠀⠀⠀⢹⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡴⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠉⠉⠉⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⠀⠈⣇⠀⠀⠀⠀⠀⠀⠀⢀⠞⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⠀⠘⣆⠀⠀⠀⠀⠀⣠⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠘⢦⡀⠀⣠⠞⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ -1.6
            0.0                                           10.0
        "#]];
        expected.assert_eq(&textplot_mapped_ode_result(
            &problem,
            &result,
            |i| i < 3,
            |x, i| x[i] - x[0],
        ));
    }
}
