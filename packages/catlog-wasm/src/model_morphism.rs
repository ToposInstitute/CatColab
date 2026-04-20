//! Wasm bindings for morphisms between models of a double theory.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use super::model::DblModel;
use catlog::dbl::{model, model_morphism::DiscreteDblModelMapping};
use catlog::{one::FgCategory, zero::QualifiedName};

/// Options for motif finder.
#[derive(Debug, Deserialize, Serialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MotifsOptions {
    #[serde(rename = "maxPathLength")]
    max_path_len: Option<usize>,
}

/// Occurrence of a motif.
#[derive(Debug, PartialEq, Eq, Deserialize, Serialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MotifOccurrence {
    /// Object generators in the occurrence.
    #[serde(rename = "obGenerators")]
    ob_generators: HashSet<QualifiedName>,

    /// Morphism generators in the occurence.
    #[serde(rename = "morGenerators")]
    mor_generators: HashSet<QualifiedName>,
}

impl MotifOccurrence {
    fn from_image(mapping: DiscreteDblModelMapping, model: &model::DiscreteDblModel) -> Self {
        let (mut ob_generators, mut mor_generators) = (HashSet::new(), HashSet::new());
        for (_, x) in mapping.0.ob_generator_map {
            ob_generators.insert(x);
        }
        for (_, path) in mapping.0.mor_generator_map {
            for e in path {
                // Ensure that intermediate objects in path are also added.
                ob_generators.insert(model.mor_generator_dom(&e));
                ob_generators.insert(model.mor_generator_cod(&e));
                mor_generators.insert(e);
            }
        }
        Self { ob_generators, mor_generators }
    }
}

/// Find motifs in a model of a discrete double theory.
pub fn motifs(
    motif: &model::DiscreteDblModel,
    target: &DblModel,
    options: MotifsOptions,
) -> Result<Vec<MotifOccurrence>, String> {
    let model = target.discrete()?;
    let mut finder = DiscreteDblModelMapping::morphisms(motif, model);
    if let Some(n) = options.max_path_len {
        finder.max_path_len(n);
    }
    let mut images: Vec<_> = finder
        .monic()
        .find_all()
        .into_iter()
        .map(|mapping| MotifOccurrence::from_image(mapping, model))
        .collect();

    // Order motifs from small to large.
    images.sort_by_key(|im| (im.ob_generators.len(), im.mor_generators.len()));

    // Remove duplicates: different morphisms can have the same image.
    retain_unique(&mut images);
    Ok(images)
}

/// Remove duplicate elements from a vector.
///
/// This is the naive quadratic algorithm that only uses equality tests.
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
