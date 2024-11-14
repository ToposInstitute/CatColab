/*! Diagrams in models of a double theory.

A **diagram** in a [model](super::model) is simply a
[morphism](super::model_morphism) into that model. This includes the domain of
that morphism, which is assumed to be a free model.

Diagrams are currently used primarily to represent instances of models from a
fibered perspective, generalizing how a diagram in a category can be used to
represent a copresheaf over that category.

# References

TODO: Document in devs docs and link here.
 */

use std::hash::Hash;

use derive_more::Into;
use nonempty::NonEmpty;

use crate::one::FgCategory;
use crate::validate;

use super::model::DiscreteDblModel;
use super::model_morphism::DblModelMorphism;
use super::model_morphism::{DblModelMapping, DiscreteDblModelMapping, InvalidDblModelMorphism};

/** A diagram in a model of a double theory.

This struct owns its data, namely, the domain model and the model
[mapping](DblModelMapping). The domain is assumed to be a valid model of a
double theory. If that is in question, then the model should be validated
*before* validating this object.
*/
#[derive(Clone, Into)]
#[into(owned, ref, ref_mut)]
pub struct DblModelDiagram<Map, Dom>(pub Map, pub Dom);

impl<Map, Dom> DblModelDiagram<Map, Dom>
where
    Map: DblModelMapping,
{
    /// Gets an object indexed by the diagram.
    pub fn ob(&self, i: &Map::DomOb) -> Map::CodOb {
        self.0.apply_ob(i).expect("Diagram should be defined at object")
    }

    /// Gets a morphism indexed by the diagram.
    pub fn mor(&self, h: &Map::DomMor) -> Map::CodMor {
        self.0.apply_mor(h).expect("Diagram should be defined at morphism")
    }
}

/// A diagram in a model of a discrete double theory.
pub type DiscreteDblModelDiagram<DomId, CodId, Cat> =
    DblModelDiagram<DiscreteDblModelMapping<DomId, CodId>, DiscreteDblModel<DomId, Cat>>;

impl<DomId, CodId, Cat> DiscreteDblModelDiagram<DomId, CodId, Cat>
where
    DomId: Eq + Clone + Hash,
    CodId: Eq + Clone + Hash,
    Cat: FgCategory,
    Cat::Ob: Hash,
    Cat::Mor: Hash,
{
    /// Validates that the diagram is well-defined in the given model.
    pub fn validate_in(
        &self,
        model: &DiscreteDblModel<CodId, Cat>,
    ) -> Result<(), NonEmpty<InvalidDblModelMorphism<DomId, DomId>>> {
        validate::wrap_errors(self.iter_invalid_in(model))
    }

    /// Iterates over failures of the diagram to be valid in the given model.
    pub fn iter_invalid_in<'a>(
        &'a self,
        model: &'a DiscreteDblModel<CodId, Cat>,
    ) -> impl Iterator<Item = InvalidDblModelMorphism<DomId, DomId>> + '_ {
        let morphism = DblModelMorphism(&self.0, &self.1, model);
        morphism.iter_invalid()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Arc;
    use ustr::ustr;

    use crate::one::{fin_category::FinMor, Path};
    use crate::stdlib::*;

    #[test]
    fn discrete_model_diagram() {
        let th = Arc::new(th_schema());
        let mut model = DiscreteDblModel::new(th.clone());
        let entity = ustr("entity");
        model.add_ob(entity, ustr("Entity"));
        model.add_ob(ustr("type"), ustr("AttrType"));
        model.add_mor(ustr("attr"), entity, ustr("type"), FinMor::Generator(ustr("Attr")));

        let mut f: DiscreteDblModelMapping<_, _> = Default::default();
        f.assign_ob(entity, 'x');
        f.assign_ob(ustr("type"), 'y');
        f.assign_basic_mor(ustr("attr"), Path::pair('p', 'q'));

        let diagram = DblModelDiagram(f, model);
        assert_eq!(diagram.ob(&entity), 'x');
        assert_eq!(diagram.mor(&Path::single(ustr("attr"))), Path::pair('p', 'q'));
    }

    #[test]
    fn validate_model_diagram() {
        let theory = Arc::new(th_signed_category());
        let pos_loop = positive_loop(theory.clone());
        let neg_loop = negative_loop(theory.clone());

        let mut f: DiscreteDblModelMapping<_, _> = Default::default();
        f.assign_ob(ustr("x"), ustr("x"));
        f.assign_basic_mor(ustr("positive"), Path::pair(ustr("negative"), ustr("negative")));
        let diagram = DblModelDiagram(f, pos_loop);
        assert!(diagram.validate_in(&neg_loop).is_ok());
    }
}
