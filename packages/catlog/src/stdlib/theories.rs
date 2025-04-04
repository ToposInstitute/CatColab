//! Standard library of double theories.

use ustr::ustr;

use crate::dbl::theory::*;
use crate::one::fin_category::{FinMor, UstrFinCategory};

/** The empty theory, which has a single model, the empty model.

As a double category, this is the initial double category.
 */
pub fn th_empty() -> UstrDiscreteDblTheory {
    let cat: UstrFinCategory = Default::default();
    DiscreteDblTheory::from(cat)
}

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

A *signed category* is a category sliced over the group of (nonzero) signs. Free
signed categories are signed graphs, a simple mathematical model of [regulatory
networks](crate::refs::RegNets) and causal loop diagrams.
 */
pub fn th_signed_category() -> UstrDiscreteDblTheory {
    let mut sgn: UstrFinCategory = Default::default();
    let (x, n) = (ustr("Object"), ustr("Negative"));
    sgn.add_ob_generator(x);
    sgn.add_mor_generator(n, x, x);
    sgn.set_composite(n, n, FinMor::Id(x));
    DiscreteDblTheory::from(sgn)
}

/** The theory of delayable signed categories.

Free delayable signed categories are causal loop diagrams with delays, often
depicted as [caesuras](https://en.wikipedia.org/wiki/Caesura).
 */
pub fn th_delayable_signed_category() -> UstrDiscreteDblTheory {
    let mut cat: UstrFinCategory = Default::default();
    let (x, neg) = (ustr("Object"), ustr("Negative"));
    let (pos_slow, neg_slow) = (ustr("PositiveSlow"), ustr("NegativeSlow"));
    cat.add_ob_generator(x);
    cat.add_mor_generator(neg, x, x);
    cat.add_mor_generator(pos_slow, x, x);
    cat.add_mor_generator(neg_slow, x, x);
    cat.set_composite(neg, neg, FinMor::Id(x));
    cat.set_composite(neg, pos_slow, FinMor::Generator(neg_slow));
    cat.set_composite(neg, neg_slow, FinMor::Generator(pos_slow));
    cat.set_composite(pos_slow, neg, FinMor::Generator(neg_slow));
    cat.set_composite(neg_slow, neg, FinMor::Generator(pos_slow));
    cat.set_composite(pos_slow, pos_slow, FinMor::Generator(pos_slow));
    cat.set_composite(neg_slow, neg_slow, FinMor::Generator(pos_slow));
    cat.set_composite(neg_slow, pos_slow, FinMor::Generator(neg_slow));
    cat.set_composite(pos_slow, neg_slow, FinMor::Generator(neg_slow));
    DiscreteDblTheory::from(cat)
}

/** The theory of nullable signed categories.

A *nullable signed category* is a category sliced over the monoid of signs,
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

/** The theory of categories with scalars.

A *category with scalars* is a category sliced over the monoid representing a walking
idempotent. The morphisms over the identity are interpreted as scalars, which are closed
under composition, as are the non-scalar morphisms.

The main intended application is to categories
enriched in `M`-sets for a monoid `M` such as the positive real numbers under multiplication,
but to remain within simple theories the theory defined here is more general.
 */
pub fn th_category_with_scalars() -> UstrDiscreteDblTheory {
    let mut idem: UstrFinCategory = Default::default();
    let (x, s) = (ustr("Object"), ustr("Nonscalar"));
    idem.add_ob_generator(x);
    idem.add_mor_generator(s, x, x);
    idem.set_composite(s, s, FinMor::Generator(s));
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

/** The theory of categories with signed links.

A *category with signed links* is a category `C` together with a profunctor from `C` to
`Arr(C)`, the arrow category of C. 

It include two profunctors:

1. Positive links l+: c -> Tabulator(id(c))
2. Negative links l-: c -> Tabulator(id(c))

The composition rules:

1. If we have a link (stock s -> flow f (stock x-> stock y)) and labelled as l_i, followed by the downstream stock y of flow f, followed by 
a link from stock y to flow g (stock y -> flow g) and labelled as l_j, we can get a composed link (stock s -> flow g) by

L_i ; cod^f ; L_j

and the sign of the link from stock s to flow g is "l_i * l_j";

2. If we have a link (stock s -> flow f (stock x-> stock y)) and labelled as l_i, followed by the upstream stock x of flow f, followed by 
a link from stock x to flow g (stock x -> flow g) and labelled as l_j, we can get a composed link (stock s -> flow g) by

L_i ; dom^f ; L_j

and the sign of the link from stock s to flow g is "(-1) * l_i * l_j";

 */

pub fn th_category_signed_links() -> UstrDiscreteTabTheory {
    let mut th: UstrDiscreteTabTheory = Default::default();
    let x = ustr("Object");
    th.add_ob_type(x);
    th.add_mor_type(
        ustr("Positive"),
        TabObType::Basic(x),
        th.tabulator(th.hom_type(TabObType::Basic(x))),
    );
    th.add_mor_type(
        ustr("Negative"),
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
        assert!(th_empty().validate().is_ok());
        assert!(th_category().validate().is_ok());
        assert!(th_schema().validate().is_ok());
        assert!(th_signed_category().validate().is_ok());
        assert!(th_delayable_signed_category().validate().is_ok());
        assert!(th_nullable_signed_category().validate().is_ok());
        assert!(th_category_with_scalars().validate().is_ok());
        // TODO: Validate discrete tabulator theories.
        th_category_links();
        th_category_signed_links();
    }
}
