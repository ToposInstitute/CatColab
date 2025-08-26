//! Wasm bindings for morphisms between models of a double theory.

use catlog::dbl::model::DiscreteDblModel;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use super::model::DblModel;
use catlog::dbl::{model, model_morphism};
use catlog::one::FgCategory;

/// Options for motif finder.
#[derive(Debug, Deserialize, Serialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MotifsOptions {
    #[serde(rename = "maxPathLength")]
    max_path_len: Option<usize>,
}

/// Find motifs in a model of a discrete double theory.
pub fn motifs(
    motif: &model::DiscreteDblModel,
    target: &DblModel,
    options: MotifsOptions,
) -> Result<Vec<DblModel>, String> {
    let model = target.discrete()?;
    let mut finder = model_morphism::DiscreteDblModelMapping::morphisms(motif, model);
    if let Some(n) = options.max_path_len {
        finder.max_path_len(n);
    }
    let mut images: Vec<_> = finder
        .monic()
        .find_all()
        .into_iter()
        .map(|mapping| mapping.syntactic_image(model))
        .collect();

    // Order motifs from small to large.
    images.sort_by_key(|im| (im.ob_generators().count(), im.mor_generators().count()));

    // Remove duplicates: different morphisms can have the same image.
    retain_unique(&mut images);

    Ok(images.into_iter().map(|im| box_submodel(im, target)).collect())
}

fn box_submodel(submodel: DiscreteDblModel, model: &DblModel) -> DblModel {
    let ob_index = submodel
        .ob_generators()
        .filter_map(|id| model.ob_generator_name(&id).map(|name| (id, name)))
        .collect();
    let mor_index = submodel
        .mor_generators()
        .filter_map(|id| model.mor_generator_name(&id).map(|name| (id, name)))
        .collect();
    DblModel {
        model: submodel.into(),
        ob_index,
        mor_index,
    }
}

/** Remove duplicate elements from a vector.

This is the naive quadratic algorithm that only uses equality tests.
 */
fn retain_unique<T: Eq>(vec: &mut Vec<T>) {
    let mut i = 0;
    while i < vec.len() {
        if (0..i).any(|j| vec[j] == vec[i]) {
            vec.remove(i);
        } else {
            i += 1;
        }
    }
}
