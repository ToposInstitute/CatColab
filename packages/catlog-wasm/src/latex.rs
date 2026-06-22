//! Auxiliary structs and glue code for any LaTeX code being passed through analyses.

use catlog::zero::QualifiedName;

use super::model::DblModel;

fn wrap_with_backslash_text(name: String) -> String {
    if name.chars().count() > 1 {
        format!("\\text{{{name}}}")
    } else {
        name.to_string()
    }
}

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
                .mor_generator_dom_cod_label_strings(id)
                .expect("Morphism in equation system should have domain and codomain");
            format!("{} \\to {}", wrap_with_backslash_text(dom), wrap_with_backslash_text(cod))
        }
    }
}
