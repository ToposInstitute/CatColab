/*! Standard library of morphisms between double theories.

These can be used to migrate models from one theory to another.
 */

use crate::one::{FpFunctorData, Path, QualifiedPath};
use crate::zero::{name, HashColumn, QualifiedName};

type DiscreteDblTheoryMap = FpFunctorData<
    HashColumn<QualifiedName, QualifiedName>,
    HashColumn<QualifiedName, QualifiedPath>,
>;

/** Map from theory of categories to the theories of schemas.

Sigma migration along this map sends objects in a category to entity types in a
schema, yielding a schema with no attributes or attribute types.
 */
pub fn th_category_to_schema() -> DiscreteDblTheoryMap {
    FpFunctorData::new(
        HashColumn::new([(name("Object"), name("Entity"))].into()),
        HashColumn::default(),
    )
}

/** Map from theory of schemas to theory of categories.

Sigma migration along this map erases the distinction between entity types and
attribute types, turning both into objects in a category.
 */
pub fn th_schema_to_category() -> DiscreteDblTheoryMap {
    FpFunctorData::new(
        HashColumn::new(
            [(name("Entity"), name("Object")), (name("AttrType"), name("Object"))].into(),
        ),
        HashColumn::new([(name("Attr"), Path::Id(name("Object")))].into()),
    )
}

/** Projection from theory of delayable signed categories.

Sigma migration along this map forgets about the delays.
 */
pub fn th_delayable_signed_category_to_signed_category() -> DiscreteDblTheoryMap {
    FpFunctorData::new(
        HashColumn::new([(name("Object"), name("Object"))].into()),
        HashColumn::new(
            [
                (name("Negative"), name("Negative").into()),
                (name("Slow"), Path::Id(name("Object"))),
                // TODO: Shouldn't have to define on these superfluous generators.
                (name("PositiveSlow"), Path::Id(name("Object"))),
                (name("NegativeSlow"), name("Negative").into()),
            ]
            .into(),
        ),
    )
}

/** Projection from theory of degree-delay signed categories.

Sigma migration along this map forgets about the degrees and delays.
 */
pub fn th_deg_del_signed_category_to_signed_category() -> DiscreteDblTheoryMap {
    FpFunctorData::new(
        HashColumn::new([(name("Object"), name("Object"))].into()),
        HashColumn::new(
            [
                (name("Negative"), name("Negative").into()),
                (name("Degree"), Path::Id(name("Object"))),
                (name("Delay"), Path::Id(name("Object"))),
            ]
            .into(),
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::super::theories::*;
    use super::*;

    #[test]
    fn discrete_theory_morphisms() {
        let (th_cat, th_sch) = (th_category().0, th_schema().0);
        assert!(th_category_to_schema().functor_into(&th_sch).validate_on(&th_cat).is_ok());
        assert!(th_schema_to_category().functor_into(&th_cat).validate_on(&th_sch).is_ok());

        assert!(th_delayable_signed_category_to_signed_category()
            .functor_into(&th_signed_category().0)
            .validate_on(&th_delayable_signed_category().0)
            .is_ok());
    }
}
