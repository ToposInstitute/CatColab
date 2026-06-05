//! Lotka-Volterra ODE semantics.

use super::ode_builder::PolynomialODESystemBuilder;
use crate::dbl::{
    model::{DiscreteDblModel, FpDblModel, ModalDblModel, MutDblModel},
    theory::NonUnital,
};
use crate::one::{Path, QualifiedPath};
use crate::zero::{QualifiedName, name, name_seg};

/// Lotka-Volterra ODE analysis intended for signed graphs.
pub struct LotkaVolterraAnalysis {
    /// Object type for variables.
    pub var_ob_type: QualifiedName,
    /// Morphism type for positive links.
    pub pos_link_type: QualifiedPath,
    /// Morphism type for negative links.
    pub neg_link_type: QualifiedPath,
}

impl Default for LotkaVolterraAnalysis {
    fn default() -> Self {
        let ob_type = name("Object");
        Self {
            var_ob_type: ob_type.clone(),
            pos_link_type: Path::Id(ob_type),
            neg_link_type: Path::single(name("Negative")),
        }
    }
}

impl LotkaVolterraAnalysis {
    /// Builds a polynomial ODE system.
    pub fn build_ode_system(&self, model: &DiscreteDblModel) -> ModalDblModel<NonUnital> {
        let mut builder = PolynomialODESystemBuilder::new();

        for var in model.ob_generators_with_type(&self.var_ob_type) {
            builder.add_variable(var.clone());

            // Arbitrarily signed contribution for growth or decay.
            let id = var.cons(name_seg("Growth"));
            builder.add_contribution(id, var.clone(), [var]);
        }

        // FIXME: Should be *positively signed* contributions.
        for mor in model.mor_generators_with_type(&self.pos_link_type) {
            let (Some(dom), Some(cod)) = (model.get_dom(&mor), model.get_cod(&mor)) else {
                continue;
            };
            let id = mor.cons(name_seg("Influence"));
            builder.add_contribution(id, dom.clone(), [dom.clone(), cod.clone()]);
        }

        // FIXME: Should be *negatively signed* contributions.
        for mor in model.mor_generators_with_type(&self.neg_link_type) {
            let (Some(dom), Some(cod)) = (model.get_dom(&mor), model.get_cod(&mor)) else {
                continue;
            };
            let id = mor.cons(name_seg("Influence"));
            builder.add_contribution(id, dom.clone(), [dom.clone(), cod.clone()]);
        }

        builder.model()
    }
}
