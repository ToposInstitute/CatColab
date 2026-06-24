//! Auxiliary structs and glue code for any LaTeX code being passed through analyses.

use catlog::zero::QualifiedName;

use super::model::DblModel;

/// Wrap a string with a Latex text literal if it is longer than a single character.
///
/// Note that this is not a perfect solution, and is built on a lot of assumptions. Ideally, the
/// frontend should allow users to mark names as Latex or not.
fn wrap_with_backslash_text(name: String) -> String {
    if name.chars().count() > 1 {
        format!("\\text{{{name}}}")
    } else {
        name.to_string()
    }
}

/// Display a single-object list [x] directly as "x", but display any longer list as "[x, y ,z]".
fn list_object_as_latex(vec: Vec<String>) -> String {
    if vec.len() > 1 {
        format!("[{}]", vec.join(", "))
    } else {
        vec[0].to_string()
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
