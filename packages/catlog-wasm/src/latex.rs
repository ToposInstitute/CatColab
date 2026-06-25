//! Auxiliary structs and glue code for any LaTeX code being passed through analyses.

use catlog::{
    latex::{list_object_as_latex, wrap_with_backslash_text},
    zero::QualifiedName,
};

use super::model::DblModel;

/// Creates a closure that formats object and morphism names for LaTeX output. When a morphism has a
/// name (and thus label), it is used directly; when unnamed, the label falls back to the format
/// `domain→codomain` (e.g., `X \to Y`).
pub(crate) fn latex_names(model: &DblModel) -> impl Fn(&QualifiedName) -> String {
    |id: &QualifiedName| {
        if let Some(ob_label) = model.ob_namespace.label(id) {
            wrap_with_backslash_text(ob_label.to_string())
        } else if let Some(mor_label) = model.mor_namespace.label(id) {
            wrap_with_backslash_text(mor_label.to_string())
        } else {
            let (dom, cod) = model
                .mor_generator_dom_cod(id)
                .expect("Morphism in equation system should have domain and codomain.");
            let dom_labels: Vec<String> = model
                .get_ob_label(&dom)
                .expect("Object in equation system should have a label.")
                .into_iter()
                .map(|label| wrap_with_backslash_text(label.to_string()))
                .collect();
            let cod_labels: Vec<String> = model
                .get_ob_label(&cod)
                .expect("Object in equation system should have a label.")
                .into_iter()
                .map(|label| wrap_with_backslash_text(label.to_string()))
                .collect();
            format!(
                "{} \\to {}",
                list_object_as_latex(dom_labels),
                list_object_as_latex(cod_labels)
            )
        }
    }
}
