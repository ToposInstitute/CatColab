use std::hash::Hash;

use super::model::DblModel;
use catlog::dbl::model::{self, DblModel as BaseDblModel};
use catlog::dbl::model_morphism::DiscreteDblModelMapping;
use catlog::one::fin_category::UstrFinCategory;

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
    images.sort_by_key(|im| (im.objects().count(), im.morphisms().count()));

    Ok(images.into_iter().map(|im| im.into()).collect())
}
