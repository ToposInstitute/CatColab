//! Wasm bindings for morphisms between models of a double theory.

use std::hash::Hash;

use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use catlog::dbl::{model, model_morphism};
use catlog::one::{FgCategory, fp_category::UstrFpCategory};

use super::model::DblModel;

pub(crate) type DiscreteDblModelMapping = model_morphism::DiscreteDblModelMapping<Uuid, Uuid>;

/// Options for motif finder.
#[derive(Debug, Deserialize, Serialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MotifsOptions {
    #[serde(rename = "maxPathLength")]
    max_path_len: Option<usize>,
}

/// Find motifs in a model of a discrete double theory.
pub fn motifs<Id>(
    motif: &model::DiscreteDblModel<Id, UstrFpCategory>,
    model: &DblModel,
    options: MotifsOptions,
) -> Result<Vec<DblModel>, String>
where
    Id: Clone + Eq + Hash,
{
    let model = model.discrete()?;
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

    Ok(images.into_iter().map(|im| DblModel(im.into())).collect())
}

/** Remove duplicate elements from a vector.

This is the naive quadratic algorithm that only uses equality tests.
 */
fn retain_unique<T>(vec: &mut Vec<T>)
where
    T: Eq,
{
    let mut i = 0;
    while i < vec.len() {
        if (0..i).any(|j| vec[j] == vec[i]) {
            vec.remove(i);
        } else {
            i += 1;
        }
    }
}
