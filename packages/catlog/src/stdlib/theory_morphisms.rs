/*! Standard library of morphisms between double theories.

These can be used to migrate models from one theory to another.
 */

use ustr::{Ustr, ustr};

use crate::one::{FpFunctorData, Path};
use crate::zero::HashColumn;

type DiscreteDblTheoryMap<Id> = FpFunctorData<HashColumn<Id, Id>, HashColumn<Id, Path<Id, Id>>>;

/** Map from theory of categories to the theories of schemas.

Sigma migration along this map sends objects in a category to entity types in a
schema, yielding a schema with no attributes or attribute types.
 */
pub fn th_category_to_schema() -> DiscreteDblTheoryMap<Ustr> {
    FpFunctorData::new(
        HashColumn::new([(ustr("Object"), ustr("Entity"))].into()),
        HashColumn::default(),
    )
}

/** Map from theory of scehmas to theory of categories.

Sigma migration along this map erases the distinction between entity types and
attribute types, turning both into objects in a category.
 */
pub fn th_schema_to_category() -> DiscreteDblTheoryMap<Ustr> {
    let x = ustr("Object");
    FpFunctorData::new(
        HashColumn::new([(ustr("Entity"), x), (ustr("AttrType"), x)].into()),
        HashColumn::new([(ustr("Attr"), Path::Id(x))].into()),
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
    }
}
