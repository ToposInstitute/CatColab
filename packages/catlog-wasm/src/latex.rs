//! LaTeX formatting utilities

use catlog::stdlib::analyses::ode::DirectedTerm;
use catlog::zero::QualifiedName;

use super::model::DblModel;

/// Creates a closure that formats object names for LaTeX output.
pub(crate) fn latex_ob_names_mass_action(model: &DblModel) -> impl Fn(&QualifiedName) -> String {
    |id: &QualifiedName| {
        let name = model
            .ob_generator_label(id)
            .map_or_else(|| id.to_string(), |label| label.to_string());

        if name.chars().count() > 1 {
            format!("\\text{{{name}}}")
        } else {
            name
        }
    }
}

/// Creates a closure that formats morphism names for LaTeX output.
pub(crate) fn latex_mor_names_mass_action(model: &DblModel) -> impl Fn(&QualifiedName) -> String {
    |id: &QualifiedName| {
        let name = model
            .mor_generator_label(id)
            .map_or_else(|| id.to_string(), |label| label.to_string());
        format!("r_{{\\text{{{name}}}}}")
    }
}

/// Creates a closure that formats morphism names for unbalanced mass-action LaTeX output.
pub(crate) fn latex_mor_names_unbalanced_mass_action(
    model: &DblModel,
) -> impl Fn(&DirectedTerm) -> String {
    |id: &DirectedTerm| match id {
        DirectedTerm::IncomingFlow(id) => {
            let name = model
                .mor_generator_label(id)
                .map_or_else(|| id.to_string(), |label| label.to_string());
            format!("r_{{\\text{{prod}},\\,\\text{{{name}}}}}")
        }
        DirectedTerm::OutgoingFlow(id) => {
            let name = model
                .mor_generator_label(id)
                .map_or_else(|| id.to_string(), |label| label.to_string());
            format!("r_{{\\text{{cons}},\\,\\text{{{name}}}}}")
        }
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use catlog::simulate::ode::LatexEquation;
    use catlog::stdlib::analyses::ode::StockFlowMassActionAnalysis;
    use notebook_types::current::{MorDecl, MorType, Ob, ObDecl, ObType};

    use super::*;
    use crate::model::DblModel;
    use crate::theories::ThCategoryLinks;

    fn backward_link_model() -> DblModel {
        let th = ThCategoryLinks::new().theory();
        let mut model = DblModel::new(&th);
        let [f, x, y, link] = [Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7()];
        model
            .add_ob(&ObDecl {
                name: "xxx".into(),
                id: x,
                ob_type: ObType::Basic("Object".into()),
            })
            .unwrap();
        model
            .add_ob(&ObDecl {
                name: "yyy".into(),
                id: y,
                ob_type: ObType::Basic("Object".into()),
            })
            .unwrap();
        model
            .add_mor(&MorDecl {
                name: "fff".into(),
                id: f,
                mor_type: MorType::Hom(Box::new(ObType::Basic("Object".into()))),
                dom: Some(Ob::Basic(x.to_string())),
                cod: Some(Ob::Basic(y.to_string())),
            })
            .unwrap();
        model
            .add_mor(&MorDecl {
                name: "link".into(),
                id: link,
                mor_type: MorType::Basic("Link".into()),
                dom: Some(Ob::Basic(y.to_string())),
                cod: Some(Ob::Tabulated(notebook_types::current::Mor::Basic(f.to_string()))),
            })
            .unwrap();
        model
    }

    #[test]
    fn mass_action_latex_equations() {
        let model = backward_link_model();
        let tab_model = model.discrete_tab().unwrap();
        let analysis = StockFlowMassActionAnalysis::default();
        let sys = analysis.build_system(tab_model);
        let equations = sys
            .map_variables(latex_ob_names_mass_action(&model))
            .extend_scalars(|param| param.map_variables(latex_mor_names_mass_action(&model)))
            .to_latex_equations();

        let expected = vec![
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{xxx}".to_string(),
                rhs: "(-r_{\\text{fff}}) \\text{xxx} \\text{yyy}".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} \\text{yyy}".to_string(),
                rhs: "(r_{\\text{fff}}) \\text{xxx} \\text{yyy}".to_string(),
            },
        ];
        assert_eq!(equations, expected);
    }
}
