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

use nonempty::NonEmpty;
use thiserror::Error;

use crate::one::*;
use crate::validate::{self, Validate};

use super::model::DiscreteDblModel;
use super::model_morphism::{DblModelMapping, DiscreteDblModelMapping};

/** A diagram in a model of a double theory.

This struct owns its data, namely, the domain model and the model
[mapping](DblModelMapping). The domain is assumed to be a valid model of a
double theory. If that is in question, then the model should be validated
*before* validating this object.
*/
pub struct DblModelDiagram<Map, Dom>(Map, Dom);

impl<Map, Dom> DblModelDiagram<Map, Dom> {
    /// The mapping underlying the diagram.
    pub fn mapping(&self) -> &Map {
        &self.0
    }

    /// The domain, or shape, of the diagram.
    pub fn domain(&self) -> &Dom {
        &self.1
    }
}

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

/** An invalid assignment in a double model diagram defined explicitly by data.
 *
 * Note that, by specifying a model morphism via its action on generators, we
 * obtain for free that identities are sent to identities and composites of
 * generators are sent to their composites in the codomain.
*/
#[derive(Debug, Error, PartialEq, Clone)]
pub enum InvalidDblModelDiagram<Ob, Mor> {
    /// Missing data
    #[error("Object `{0}` is not mapped to anything in the codomain")]
    MissingOb(Ob),

    /// Missing data
    #[error("Morphism `{0}` is not mapped to anything in the codomain")]
    MissingMor(Mor),
}

impl<DomId, CodId, Cat> Validate for DiscreteDblModelDiagram<DomId, CodId, Cat>
where
    DomId: Eq + Clone + Hash,
    CodId: Eq + Clone + Hash,
    Cat: FgCategory,
    Cat::Ob: Hash,
    Cat::Mor: Hash,
{
    type ValidationError = InvalidDblModelDiagram<DomId, DomId>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

impl<DomId, CodId, Cat> DiscreteDblModelDiagram<DomId, CodId, Cat>
where
    DomId: Eq + Clone + Hash,
    CodId: Eq + Clone + Hash,
    Cat: FgCategory,
    Cat::Ob: Hash,
    Cat::Mor: Hash,
{
    /// An iterator over invalid objects and morphisms in the diagram.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidDblModelDiagram<DomId, DomId>> + '_ {
        let DblModelDiagram(mapping, dom) = self;

        // Diagrams can always be indexed by free models.
        assert!(dom.is_free(), "Domain model should be free");
        let ob_errors = dom.object_generators().filter_map(|v| {
            if mapping.apply_ob(&v).is_some() {
                None
            } else {
                Some(InvalidDblModelDiagram::MissingOb(v))
            }
        });

        let mor_errors = dom.morphism_generators().flat_map(|f| {
            if mapping.apply_basic_mor(&f).is_some() {
                vec![] // No errors
            } else {
                [InvalidDblModelDiagram::MissingMor(f)].to_vec()
            }
        });

        ob_errors.chain(mor_errors)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Arc;
    use ustr::ustr;

    use crate::one::fin_category::FinMor;
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
        let negloop = negative_loop(theory.clone());

        let mut f: DiscreteDblModelMapping<_, _> = Default::default();
        f.assign_ob(ustr("x"), ustr("x"));
        f.assign_basic_mor(ustr(""), Path::Id(ustr("negative")));
        let dmd = DblModelDiagram(f, negloop);
        assert!(dmd.validate().is_err());
        // A bad map from h to itself that is wrong for the ob (it is in the map
        // but sent to something that doesn't exist) and for the hom generator
        // (not in the map)
    }
}
