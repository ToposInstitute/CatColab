use std::hash::Hash;

use super::model::DblModel;
use catlog::dbl::model;
use catlog::dbl::model_morphism::DiscreteDblModelMapping;
use catlog::one::fin_category::UstrFinCategory;
use catlog::one::FgCategory;

/// Find motifs in a model of a discrete double theory.
pub fn motifs<Id>(
    motif: &model::DiscreteDblModel<Id, UstrFinCategory>,
    model: &DblModel,
) -> Result<Vec<DblModel>, String>
where
    Id: Clone + Eq + Hash,
{
    let model: &model::DiscreteDblModel<_, _> = model.try_into()?;
    let mut images: Vec<_> = DiscreteDblModelMapping::morphisms(motif, model)
        .monic()
        .find_all()
        .into_iter()
        .map(|mapping| mapping.syntactic_image(model))
        .collect();

    // Order motifs from small to large.
    images.sort_by_key(|im| (im.object_generators().count(), im.morphism_generators().count()));

    // Remove duplicates: different morphisms can have the same image.
    retain_unique(&mut images);

    Ok(images.into_iter().map(|im| im.into()).collect())
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
