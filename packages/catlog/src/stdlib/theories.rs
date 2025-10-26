//! Standard library of double theories.

use crate::dbl::theory::*;
use crate::one::{Path, fp_category::FpCategory};
use crate::zero::name;

/// The empty theory, which has a single model, the empty model.
///
/// As a double category, this is the initial double category.
pub fn th_empty() -> DiscreteDblTheory {
    FpCategory::new().into()
}

/// The theory of categories, aka the trivial double theory.
///
/// As a double category, this is the terminal double category.
pub fn th_category() -> DiscreteDblTheory {
    let mut cat = FpCategory::new();
    cat.add_ob_generator(name("Object"));
    cat.into()
}

/// The theory of database schemas with attributes.
///
/// As a double category, this is the "walking proarrow".
pub fn th_schema() -> DiscreteDblTheory {
    let mut cat = FpCategory::new();
    cat.add_ob_generator(name("Entity"));
    cat.add_ob_generator(name("AttrType"));
    cat.add_mor_generator(name("Attr"), name("Entity"), name("AttrType"));
    cat.into()
}

/// The theory of signed categories.
///
/// A *signed category* is a category sliced over the group of (nonzero) signs. Free
/// signed categories are signed graphs, a simple mathematical model of [regulatory
/// networks](crate::refs::RegNets) and causal loop diagrams.
pub fn th_signed_category() -> DiscreteDblTheory {
    let mut sgn = FpCategory::new();
    sgn.add_ob_generator(name("Object"));
    sgn.add_mor_generator(name("Negative"), name("Object"), name("Object"));
    sgn.equate(Path::pair(name("Negative"), name("Negative")), Path::empty(name("Object")));
    sgn.into()
}

/// The theory of delayable signed categories.
///
/// Free delayable signed categories are causal loop diagrams with delays, often
/// depicted as [caesuras](https://en.wikipedia.org/wiki/Caesura).
pub fn th_delayable_signed_category() -> DiscreteDblTheory {
    let mut cat = FpCategory::new();
    cat.add_ob_generator(name("Object"));
    cat.add_mor_generator(name("Negative"), name("Object"), name("Object"));
    cat.add_mor_generator(name("Slow"), name("Object"), name("Object"));
    cat.equate(Path::pair(name("Negative"), name("Negative")), Path::empty(name("Object")));
    cat.equate(Path::pair(name("Slow"), name("Slow")), name("Slow").into());
    cat.equate(
        Path::pair(name("Negative"), name("Slow")),
        Path::pair(name("Slow"), name("Negative")),
    );

    // NOTE: These aliases are superfluous but are included for backwards
    // compatibility with the previous version of the theory, defined by an
    // explicit multiplication table.
    cat.add_mor_generator(name("PositiveSlow"), name("Object"), name("Object"));
    cat.add_mor_generator(name("NegativeSlow"), name("Object"), name("Object"));
    cat.equate(name("PositiveSlow").into(), name("Slow").into());
    cat.equate(name("NegativeSlow").into(), Path::pair(name("Negative"), name("Slow")));

    cat.into()
}

/// The theory of nullable signed categories.
///
/// A *nullable signed category* is a category sliced over the monoid of signs,
/// including zero.
pub fn th_nullable_signed_category() -> DiscreteDblTheory {
    let mut sgn = FpCategory::new();
    sgn.add_ob_generator(name("Object"));
    sgn.add_mor_generator(name("Negative"), name("Object"), name("Object"));
    sgn.add_mor_generator(name("Zero"), name("Object"), name("Object"));
    sgn.equate(Path::pair(name("Negative"), name("Negative")), Path::empty(name("Object")));
    sgn.equate(Path::pair(name("Negative"), name("Zero")), name("Zero").into());
    sgn.equate(Path::pair(name("Zero"), name("Negative")), name("Zero").into());
    sgn.equate(Path::pair(name("Zero"), name("Zero")), name("Zero").into());
    sgn.into()
}

/// The theory of categories with scalars.
///
/// A *category with scalars* is a category sliced over the monoid representing a walking
/// idempotent. The morphisms over the identity are interpreted as scalars, which are closed
/// under composition, as are the non-scalar morphisms.
///
/// The main intended application is to categories
/// enriched in `M`-sets for a monoid `M` such as the positive real numbers under multiplication,
/// but to remain within simple theories the theory defined here is more general.
pub fn th_category_with_scalars() -> DiscreteDblTheory {
    let mut idem = FpCategory::new();
    idem.add_ob_generator(name("Object"));
    idem.add_mor_generator(name("Nonscalar"), name("Object"), name("Object"));
    idem.equate(Path::pair(name("Nonscalar"), name("Nonscalar")), name("Nonscalar").into());
    idem.into()
}

/// The theory of categories with links.
///
/// A *category with links* is a category `C` together with a profunctor from `C` to
/// `Arr(C)`, the arrow category of C.
///
/// [Primitive stock and flow diagrams](crate::refs::StockFlow) are free categories
/// with links.
pub fn th_category_links() -> DiscreteTabTheory {
    let mut th = DiscreteTabTheory::new();
    th.add_ob_type(name("Object"));
    let ob_type = TabObType::Basic(name("Object"));
    th.add_mor_type(name("Link"), ob_type.clone(), th.tabulator(th.hom_type(ob_type)));
    th
}

/// The theory of strict monoidal categories.
pub fn th_monoidal_category() -> ModalDblTheory {
    th_list_algebra(List::Plain)
}

/// The theory of lax monoidal categories.
pub fn th_lax_monoidal_category() -> ModalDblTheory {
    th_list_lax_algebra(List::Plain)
}

/// The theory of strict symmetric monoidal categories.
pub fn th_sym_monoidal_category() -> ModalDblTheory {
    th_list_algebra(List::Symmetric)
}

/// The theory of a strict algebra of a list monad.
///
/// This is a modal double theory, parametric over which variant of the double list
/// monad is used.
fn th_list_algebra(list: List) -> ModalDblTheory {
    let m = Modality::List(list);

    let mut th = ModalDblTheory::new();
    th.add_ob_type(name("Object"));
    let x = ModeApp::new(name("Object"));
    th.add_ob_op(name("tensor"), x.clone().apply(m), x.clone());
    let a = ModeApp::new(name("tensor").into());

    th.equate_ob_ops(
        Path::pair(a.clone().apply(m), a.clone()),
        Path::pair(ModeApp::new(ModalOp::Concat(list, 2, x.clone())), a.clone()),
    );
    th.equate_ob_ops(
        Path::empty(x.clone()),
        Path::pair(ModeApp::new(ModalOp::Concat(list, 0, x)), a),
    );
    th
}

/// The theory of a lax algebra over a list monad.
fn th_list_lax_algebra(list: List) -> ModalDblTheory {
    let m = Modality::List(list);

    let mut th = ModalDblTheory::new();
    th.add_ob_type(name("Object"));
    let x = ModeApp::new(name("Object"));
    th.add_ob_op(name("tensor"), x.clone().apply(m), x.clone());
    let a = ModeApp::new(name("tensor").into());

    th.add_special_mor_op(
        name("Associator"),
        Path::pair(a.clone().apply(m), a.clone()),
        Path::pair(ModeApp::new(ModalOp::Concat(list, 2, x.clone())), a.clone()),
    );
    th.add_special_mor_op(
        name("Unitor"),
        Path::empty(x.clone()),
        Path::pair(ModeApp::new(ModalOp::Concat(list, 0, x)), a),
    );
    // TODO: Coherence equations
    th
}

/// The theory of a (non-symmetric) multicategory.
pub fn th_multicategory() -> ModalDblTheory {
    th_generalized_multicategory(List::Plain)
}

/// The theory of a generalized multicategory over a list monad.
fn th_generalized_multicategory(list: List) -> ModalDblTheory {
    let mut th = ModalDblTheory::new();
    th.add_ob_type(name("Object"));
    let x = ModeApp::new(name("Object"));
    th.add_mor_type(name("Multihom"), x.clone().apply(Modality::List(list)), x);
    // TODO: Axioms, which depend on implementing composites and restrictions.
    th
}

/// A theory of a power system.
///
/// Free models of this theory are models (in the colloquial sense) of a power
/// system, such as a power grid. This theory is inspired by the ontology behind
/// [PyPSA](https://pypsa.org/), described with admirable precision in the
/// [Design](https://docs.pypsa.org/latest/user-guide/design/) section of the
/// PyPSA User Guide.
///
/// According to PyPSA's ontology, the fundamental nodes in a power system are
/// **buses**. The **branches** between buses along which power flows are
/// classified as follows:
///
/// 1. **Passive** branches: power flow is determined passively by impedances
///    and power imbalances
///    - **lines** include power transmission and distribution lines
///    - **transformers** change AC voltage levels
/// 2. **Active** branches: power flow can be actively controlled by optimization
///    - **links** are the generic term for controllable directed flows
///
/// These types of branches form a hierarchy. Comparing the [line
/// model](https://docs.pypsa.org/latest/user-guide/power-flow/#line-model) with
/// the [transformer
/// model](https://docs.pypsa.org/latest/user-guide/power-flow/#transformer-model),
/// the analytical model of a line is a special case of that of a transformer
/// (set the tap ratio to one and the phase shift to zero). It is meaningful to
/// consider
/// [sub-networks](https://docs.pypsa.org/latest/user-guide/components/sub-networks/)
/// formed by passive branches.
pub fn th_power_system() -> DiscreteDblTheory {
    let mut cat = FpCategory::new();
    cat.add_ob_generator(name("Bus"));
    cat.add_mor_generator(name("Passive"), name("Bus"), name("Bus"));
    cat.add_mor_generator(name("Controllable"), name("Bus"), name("Bus"));
    cat.equate(Path::pair(name("Passive"), name("Passive")), name("Passive").into());
    cat.equate(Path::pair(name("Passive"), name("Controllable")), name("Controllable").into());
    cat.equate(Path::pair(name("Controllable"), name("Passive")), name("Controllable").into());
    cat.equate(
        Path::pair(name("Controllable"), name("Controllable")),
        name("Controllable").into(),
    );
    cat.into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{one::Category, validate::Validate};
    use nonempty::nonempty;

    #[test]
    fn validate_discrete_theories() {
        assert!(th_empty().validate().is_ok());
        assert!(th_category().validate().is_ok());
        assert!(th_schema().validate().is_ok());
        assert!(th_signed_category().validate().is_ok());
        assert!(th_delayable_signed_category().validate().is_ok());
        assert!(th_nullable_signed_category().validate().is_ok());
        assert!(th_category_with_scalars().validate().is_ok());
        assert!(th_power_system().validate().is_ok());
    }

    #[test]
    fn validate_discrete_tabulator_theories() {
        // TODO: Implementation validation for discrete tabulator theories.
        th_category_links();
    }

    #[test]
    fn validate_modal_theories() {
        assert!(th_monoidal_category().validate().is_ok());
        assert!(th_lax_monoidal_category().validate().is_ok());
        assert!(th_multicategory().validate().is_ok());
    }

    #[test]
    fn delayable_signed_categories() {
        // Check the nontrivial computer algebra in this theory.
        let th = th_delayable_signed_category();
        assert!(th.has_mor_type(&name("Negative").into()));
        assert!(th.has_mor_type(&name("Slow").into()));
        let path =
            Path::Seq(nonempty![name("Negative"), name("Slow"), name("Negative"), name("Slow")]);
        assert!(th.0.morphisms_are_equal(path, name("Slow").into()));
    }
}
