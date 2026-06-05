//! Convenient interface to build ODE systems.

use crate::dbl::{modal::*, model::MutDblModel, theory::NonUnital};
use crate::stdlib::theories::th_polynomial_ode_system;
use crate::zero::{QualifiedName, name};

/// Builder for polynomial ODE systems.
///
/// This struct is just a convenient interface to construct a model of the
/// [theory of polynomial ODE systems](th_polynomial_ode_system). Being an
/// ordinary mutable Rust struct, it does *not* constitute a declarative
/// language to define ODE semantics for models of other theories. However, the
/// idea is that it should be used in a style that can mechanically translated
/// to a future declarative language for model migration.
///
/// Since an ODE semantics often has contributions of several types, a useful
/// pattern is to use qualified names with an initial segment indicating the
/// type of contribution. This corresponds to a model migration in which the
/// contributions arise as a coproduct of several queries.
pub struct PolynomialODESystemBuilder {
    model: ModalDblModel<NonUnital>,
}

impl Default for PolynomialODESystemBuilder {
    fn default() -> Self {
        let th = th_polynomial_ode_system();
        Self { model: ModalDblModel::new(th.into()) }
    }
}

impl PolynomialODESystemBuilder {
    /// Constructs an empty ODE system.
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns a model of the theory of polynomial ODE systems.
    pub fn model(self) -> ModalDblModel<NonUnital> {
        self.model
    }

    /// Adds a state variable to the ODE system.
    pub fn add_variable(&mut self, var: QualifiedName) {
        self.model.add_ob(var, ModeApp::new(name("State")));
    }

    /// Adds a contribution to the ODE system.
    pub fn add_contribution(
        &mut self,
        id: QualifiedName,
        var: QualifiedName,
        monomial: impl IntoIterator<Item = QualifiedName>,
    ) {
        let monomial = monomial.into_iter().map(ModalOb::Generator).collect();
        self.model.add_mor(
            id,
            ModalOb::List(List::Symmetric, monomial),
            ModalOb::Generator(var),
            ModeApp::new(name("Contribution")).into(),
        )
    }
}
