//! Standard library of double theories.

use ustr::ustr;

use crate::dbl::theory::*;
use crate::one::fin_category::{FinMor, UstrFinCategory};

/** The theory of categories, aka the trivial double theory.

As a double category, this is the terminal double category.
 */
pub fn th_category() -> UstrDiscreteDblTheory {
    let mut cat: UstrFinCategory = Default::default();
    cat.add_ob_generator(ustr("Object"));
    DiscreteDblTheory::from(cat)
}

/** The theory of database schemas with attributes.

As a double category, this is the "walking proarrow".
 */
pub fn th_schema() -> UstrDiscreteDblTheory {
    let mut cat: UstrFinCategory = Default::default();
    let (x, y, p) = (ustr("Entity"), ustr("AttrType"), ustr("Attr"));
    cat.add_ob_generator(x);
    cat.add_ob_generator(y);
    cat.add_mor_generator(p, x, y);
    DiscreteDblTheory::from(cat)
}

/** The theory of signed categories.

A [signed category](crate::refs::RegNets) is a category sliced over the group of
(nonzero) signs.
 */
pub fn th_signed_category() -> UstrDiscreteDblTheory {
    let mut sgn: UstrFinCategory = Default::default();
    let (x, n) = (ustr("Object"), ustr("Negative"));
    sgn.add_ob_generator(x);
    sgn.add_mor_generator(n, x, x);
    sgn.set_composite(n, n, FinMor::Id(x));
    DiscreteDblTheory::from(sgn)
}

/** The theory of nullable signed categories.

A nullable signed category is a category sliced over the monoid of signs,
including zero.
 */
pub fn th_nullable_signed_category() -> UstrDiscreteDblTheory {
    let mut sgn: UstrFinCategory = Default::default();
    let (x, n, z) = (ustr("Object"), ustr("Negative"), ustr("Zero"));
    sgn.add_ob_generator(x);
    sgn.add_mor_generator(n, x, x);
    sgn.add_mor_generator(z, x, x);
    sgn.set_composite(n, n, FinMor::Id(x));
    sgn.set_composite(z, z, FinMor::Generator(z));
    sgn.set_composite(n, z, FinMor::Generator(z));
    sgn.set_composite(z, n, FinMor::Generator(z));
    DiscreteDblTheory::from(sgn)
}

/** The theory of categories with links.

A category with links is a category `C` together with a profunctor from `C` to
`Arr(C)`, the arrow category of C.
 */
pub fn th_category_links() -> UstrDiscreteTabTheory {
    let mut th: UstrDiscreteTabTheory = Default::default();
    let x = ustr("Object");
    th.add_ob_type(x);
    th.add_mor_type(
        ustr("Link"),
        TabObType::Basic(x),
        th.tabulator(th.hom_type(TabObType::Basic(x))),
    );
    th
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate::Validate;

    #[test]
    fn theories() {
        assert!(th_category().validate().is_ok());
        assert!(th_schema().validate().is_ok());
        assert!(th_signed_category().validate().is_ok());
        assert!(th_nullable_signed_category().validate().is_ok());
        // TODO: Validate discrete tabulator theories.
        th_category_links();
    }
}
