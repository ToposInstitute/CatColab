//! Discrete double theories.

use std::hash::Hash;
use std::ops::Range;

use derive_more::From;
use ref_cast::RefCast;

use crate::dbl::{category::*, theory::InvalidDblTheory, tree::DblTree};
use crate::one::{Path, category::*, fp_category::*};
use crate::validate::{self, Validate};

/** A discrete double theory.

A **discrete double theory** is a double theory with no nontrivial operations on
either object or morphism types. Viewed as a double category, such a theory is
indeed **discrete**, which can equivalently be defined as

- a discrete object in the 2-category of double categories
- a double category whose underlying categories are both discrete categories
*/
#[derive(From, RefCast, Debug)]
#[repr(transparent)]
pub struct DiscreteDblTheory<Cat: FgCategory>(pub Cat);

/// A discrete double theory with keys of type `Ustr`.
pub type UstrDiscreteDblTheory = DiscreteDblTheory<UstrFpCategory>;

impl<C: FgCategory> VDblCategory for DiscreteDblTheory<C>
where
    C::Ob: Clone,
    C::Mor: Clone,
{
    type Ob = C::Ob;
    type Arr = C::Ob;
    type Pro = C::Mor;
    type Cell = Path<C::Ob, C::Mor>;

    fn has_ob(&self, ob: &Self::Ob) -> bool {
        self.0.has_ob(ob)
    }
    fn has_arrow(&self, arr: &Self::Arr) -> bool {
        self.0.has_ob(arr)
    }
    fn has_proarrow(&self, pro: &Self::Pro) -> bool {
        self.0.has_mor(pro)
    }
    fn has_cell(&self, path: &Self::Cell) -> bool {
        path.contained_in(UnderlyingGraph::ref_cast(&self.0))
    }

    fn dom(&self, f: &Self::Arr) -> Self::Ob {
        f.clone()
    }
    fn cod(&self, f: &Self::Arr) -> Self::Ob {
        f.clone()
    }
    fn src(&self, m: &Self::Pro) -> Self::Ob {
        self.0.dom(m)
    }
    fn tgt(&self, m: &Self::Pro) -> Self::Ob {
        self.0.cod(m)
    }

    fn cell_dom(&self, path: &Self::Cell) -> Path<Self::Ob, Self::Pro> {
        path.clone()
    }
    fn cell_cod(&self, path: &Self::Cell) -> Self::Pro {
        self.composite(path.clone()).expect("Path should have a composite")
    }
    fn cell_src(&self, path: &Self::Cell) -> Self::Arr {
        path.src(UnderlyingGraph::ref_cast(&self.0))
    }
    fn cell_tgt(&self, path: &Self::Cell) -> Self::Arr {
        path.tgt(UnderlyingGraph::ref_cast(&self.0))
    }

    fn compose(&self, path: Path<Self::Ob, Self::Arr>) -> Self::Arr {
        let disc = DiscreteCategory::ref_cast(ObSet::ref_cast(&self.0));
        disc.compose(path)
    }

    fn compose_cells(&self, tree: DblTree<Self::Arr, Self::Pro, Self::Cell>) -> Self::Cell {
        tree.dom(UnderlyingDblGraph::ref_cast(self))
    }
}

impl<C: FgCategory> VDCWithComposites for DiscreteDblTheory<C>
where
    C::Ob: Clone,
    C::Mor: Clone,
{
    fn composite(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Pro> {
        Some(self.0.compose(path))
    }

    /// In a discrete double theory, every cell is an extension.
    fn composite_ext(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Cell> {
        Some(path)
    }

    fn through_composite(&self, path: Self::Cell, range: Range<usize>) -> Option<Self::Cell> {
        let graph = UnderlyingGraph::ref_cast(&self.0);
        Some(path.replace_subpath(graph, range, |subpath| self.0.compose(subpath).into()))
    }
}

impl<Id> Validate for DiscreteDblTheory<FpCategory<Id, Id>>
where
    Id: Eq + Clone + Hash,
{
    type ValidationError = InvalidDblTheory<Id>;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.0.iter_invalid().map(|err| match err {
            InvalidFpCategory::Dom(id) => InvalidDblTheory::SrcType(id),
            InvalidFpCategory::Cod(id) => InvalidDblTheory::TgtType(id),
            InvalidFpCategory::Eq(eq, errs) => InvalidDblTheory::MorTypeEq(eq, errs),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dbl::theory::DblTheory;
    use crate::one::{Path, fp_category::FpCategory};

    #[test]
    fn theory_interface() {
        let mut sgn: FpCategory<char, char> = Default::default();
        sgn.add_ob_generator('*');
        sgn.add_mor_generator('n', '*', '*');
        sgn.equate(Path::pair('n', 'n'), Path::Id('*'));

        let th = DiscreteDblTheory::from(sgn);
        assert!(th.has_ob_type(&'*'));
        assert!(th.has_mor_type(&'n'.into()));
        let path = Path::pair('n'.into(), 'n'.into());
        assert!(th.0.morphisms_are_equal(th.compose_types(path).unwrap(), Path::Id('*')));

        assert_eq!(th.hom_type('*'), Path::Id('*'));
        assert_eq!(th.hom_op('*'), Path::single(Path::Id('*')));
    }
}
