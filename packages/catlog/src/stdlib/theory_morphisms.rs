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
