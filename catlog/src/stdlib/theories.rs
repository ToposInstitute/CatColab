//! Standard library of double theories.

use std::sync::OnceLock;
use ustr::ustr;

use crate::one::fin_category::{self, UstrFinCategory};
use crate::dbl::theory::DiscreteDblTheory;

type UstrDiscreteDblThy = DiscreteDblTheory<UstrFinCategory>;

/** The theory of categories, aka the trivial double theory.

As a double category, this is the terminal double category.
 */
pub fn th_category() -> &'static UstrDiscreteDblThy {
    static TH_CATEGORY: OnceLock<UstrDiscreteDblThy> = OnceLock::new();

    TH_CATEGORY.get_or_init(|| {
        let mut cat: UstrFinCategory = Default::default();
        cat.add_ob_generator(ustr("default"));
        DiscreteDblTheory::from(cat)
    })
}

/** The theory of profunctors.

As a double category, this is the "walking proarrow".
 */
pub fn th_profunctor() -> &'static UstrDiscreteDblThy {
    static TH_PROFUNCTOR: OnceLock<UstrDiscreteDblThy> = OnceLock::new();

    TH_PROFUNCTOR.get_or_init(|| {
        let mut cat: UstrFinCategory = Default::default();
        cat.add_ob_generator(ustr("0"));
        cat.add_ob_generator(ustr("1"));
        cat.add_hom_generator(ustr("p"), ustr("0"), ustr("1"));
        DiscreteDblTheory::from(cat)
    })
}

/** The theory of signed categories.

A signed category is a category sliced over the group of signs.
 */
pub fn th_signed_category() -> &'static UstrDiscreteDblThy {
    static TH_SIGNED_CATEGORY: OnceLock<UstrDiscreteDblThy> = OnceLock::new();

    TH_SIGNED_CATEGORY.get_or_init(|| {
        let mut sgn: UstrFinCategory = Default::default();
        let (x, n) = (ustr("default"), ustr("n"));
        sgn.add_ob_generator(x);
        sgn.add_hom_generator(n, x, x);
        sgn.set_composite(n, n, fin_category::Hom::Id(x));
        DiscreteDblTheory::from(sgn)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dbl::theory::DblTheory;

    #[test]
    fn theories() {
        assert_eq!(th_category().basic_ob_types().count(), 1);
        assert_eq!(th_profunctor().basic_ob_types().count(), 2);
        assert_eq!(th_signed_category().basic_mor_types().count(), 1);
    }
}
