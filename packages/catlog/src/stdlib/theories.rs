//! Standard library of double theories.

use ustr::ustr;

use crate::dbl::theory::*;
use crate::one::{fp_category::UstrFpCategory, Path};

/** The empty theory, which has a single model, the empty model.

As a double category, this is the initial double category.
 */
pub fn th_empty() -> UstrDiscreteDblTheory {
    let cat: UstrFpCategory = Default::default();
    DiscreteDblTheory::from(cat)
}

/** The theory of categories, aka the trivial double theory.

As a double category, this is the terminal double category.
 */
pub fn th_category() -> UstrDiscreteDblTheory {
    let mut cat: UstrFpCategory = Default::default();
    cat.add_ob_generator(ustr("Object"));
    DiscreteDblTheory::from(cat)
}

/** The theory of database schemas with attributes.

As a double category, this is the "walking proarrow".
 */
pub fn th_schema() -> UstrDiscreteDblTheory {
    let mut cat: UstrFpCategory = Default::default();
    let (x, y, p) = (ustr("Entity"), ustr("AttrType"), ustr("Attr"));
    cat.add_ob_generator(x);
    cat.add_ob_generator(y);
    cat.add_mor_generator(p, x, y);
    DiscreteDblTheory::from(cat)
}

/** The theory of signed categories.

A *signed category* is a category sliced over the group of (nonzero) signs. Free
signed categories are signed graphs, a simple mathematical model of [regulatory
networks](crate::refs::RegNets) and causal loop diagrams.
 */
pub fn th_signed_category() -> UstrDiscreteDblTheory {
    let mut sgn: UstrFpCategory = Default::default();
    let (x, neg) = (ustr("Object"), ustr("Negative"));
    sgn.add_ob_generator(x);
    sgn.add_mor_generator(neg, x, x);
    sgn.equate(Path::pair(neg, neg), Path::empty(x));
    DiscreteDblTheory::from(sgn)
}

/** The theory of delayable signed categories.

Free delayable signed categories are causal loop diagrams with delays, often
depicted as [caesuras](https://en.wikipedia.org/wiki/Caesura).
 */
pub fn th_delayable_signed_category() -> UstrDiscreteDblTheory {
    let mut cat: UstrFpCategory = Default::default();
    let (x, neg, slow) = (ustr("Object"), ustr("Negative"), ustr("Slow"));
    cat.add_ob_generator(x);
    cat.add_mor_generator(neg, x, x);
    cat.add_mor_generator(slow, x, x);
    cat.equate(Path::pair(neg, neg), Path::empty(x));
    cat.equate(Path::pair(slow, slow), slow.into());
    cat.equate(Path::pair(neg, slow), Path::pair(slow, neg));

    // NOTE: These aliases are superfluous but are included for backwards
    // compatibility with the previous version of the theory, defined by an
    // explicit multiplication table.
    let (pos_slow, neg_slow) = (ustr("PositiveSlow"), ustr("NegativeSlow"));
    cat.add_mor_generator(pos_slow, x, x);
    cat.add_mor_generator(neg_slow, x, x);
    cat.equate(pos_slow.into(), slow.into());
    cat.equate(neg_slow.into(), Path::pair(neg, slow));

    DiscreteDblTheory::from(cat)
}

/** The theory of nullable signed categories.

A *nullable signed category* is a category sliced over the monoid of signs,
including zero.
 */
pub fn th_nullable_signed_category() -> UstrDiscreteDblTheory {
    let mut sgn: UstrFpCategory = Default::default();
    let (x, neg, zero) = (ustr("Object"), ustr("Negative"), ustr("Zero"));
    sgn.add_ob_generator(x);
    sgn.add_mor_generator(neg, x, x);
    sgn.add_mor_generator(zero, x, x);
    sgn.equate(Path::pair(neg, neg), Path::empty(x));
    sgn.equate(Path::pair(neg, zero), zero.into());
    sgn.equate(Path::pair(zero, neg), zero.into());
    sgn.equate(Path::pair(zero, zero), zero.into());
    DiscreteDblTheory::from(sgn)
}

/** The theory of categories with scalars.

A *category with scalars* is a category sliced over the monoid representing a walking
idempotent. The morphisms over the identity are interpreted as scalars, which are closed
under composition, as are the non-scalar morphisms.

The main intended application is to categories
enriched in `M`-sets for a monoid `M` such as the positive real numbers under multiplication,
but to remain within simple theories the theory defined here is more general.
 */
pub fn th_category_with_scalars() -> UstrDiscreteDblTheory {
    let mut idem: UstrFpCategory = Default::default();
    let (x, s) = (ustr("Object"), ustr("Nonscalar"));
    idem.add_ob_generator(x);
    idem.add_mor_generator(s, x, x);
    idem.equate(Path::pair(s, s), s.into());
    DiscreteDblTheory::from(idem)
}

/** The theory of categories with links.

A *category with links* is a category `C` together with a profunctor from `C` to
`Arr(C)`, the arrow category of C.

[Primitive stock and flow diagrams](crate::refs::StockFlow) are free categories
with links.
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

/** The theory of stock and flow diagrams with dynamic variables.

*/
pub fn th_category_dynamic_stockflow() -> UstrDiscreteTabTheory {
    let mut th: UstrDiscreteTabTheory = Default::default();
    let x = ustr("Object");
    th.add_ob_type(x);
    // there are two proarrows from stocks to flows. they correspond to inflows and outflows.
    th.add_mor_type(
        ustr("Inflow"),
        TabObType::Basic(x),
        th.tabulator(th.hom_type(TabObType::Basic(x))),
    );
    th.add_mor_type(
        ustr("Outflow"),
        TabObType::Basic(x),
        th.tabulator(th.hom_type(TabObType::Basic(x))),
    );
    th.add_mor_type(
        ustr("Link"),
        TabObType::Basic(x),
        th.tabulator(th.hom_type(TabObType::Basic(x))),
    );
    let v = ustr("DynamicVariable");
    th.add_ob_type(v);
    // there is a proarrow from the flow tabulator to the dynamic variable
    th.add_mor_type(
        ustr("FlowLink"),
        TabObType::Basic(v),
        th.tabulator(th.hom_type(TabObType::Basic(x))),
    );
    // there is a proarrow from the variable to stocks
    th.add_mor_type(ustr("VariableLink"), TabObType::Basic(v), TabObType::Basic(x));
    th
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{one::Category, validate::Validate};
    use nonempty::nonempty;

    #[test]
    fn validate_theories() {
        assert!(th_empty().validate().is_ok());
        assert!(th_category().validate().is_ok());
        assert!(th_schema().validate().is_ok());
        assert!(th_signed_category().validate().is_ok());
        assert!(th_delayable_signed_category().validate().is_ok());
        assert!(th_nullable_signed_category().validate().is_ok());
        assert!(th_category_with_scalars().validate().is_ok());
        // TODO: Validate discrete tabulator theories.
        th_category_links();
    }

    #[test]
    fn delayable_signed_categories() {
        // Check the nontrivial computer algebra in this theory.
        let th = th_delayable_signed_category();
        let (neg, slow) = (ustr("Negative"), ustr("Slow"));
        assert!(th.has_mor_type(&neg.into()));
        assert!(th.has_mor_type(&slow.into()));
        let path = Path::Seq(nonempty![neg, slow, neg, slow]);
        assert!(th.category().morphisms_are_equal(path, slow.into()));
    }
}
