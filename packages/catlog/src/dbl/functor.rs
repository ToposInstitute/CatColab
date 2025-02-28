/*! Functors between double theories.
 *
 * This is the basic data required to perform a migration of models.
*/
use derivative::Derivative;
use std::hash::Hash;
use std::sync::Arc;

use super::model::*;
use super::theory::DiscreteDblTheory;
use crate::one::fin_category::FinMor;
use crate::{
    one::{Category, FgCategory},
    zero::{HashColumn, Mapping},
};

/** A mapping between theories of a double theory.

Analogous to a mapping between [sets](crate::zero::Mapping) or
[graphs](crate::one::GraphMapping), a theory mapping is a morphism between theories
of a double theory without specified domain or codomain theories.
 */
pub trait DblTheoryMapping {
    /// Type of objects in the domain theory.
    type DomOb: Eq + Clone;

    /// Type of morphisms in the domain theory.
    type DomMor: Eq + Clone;

    /// Type of objects in the codomain theory.
    type CodOb: Eq + Clone;

    /// Type of morphisms in the codomain theory.
    type CodMor: Eq + Clone;

    /// Type of object operations (proarrows) in the codomain theory.
    type DomObOp: Eq + Clone;

    /// Type of morphism operations (cells) in the codomain theory.
    type DomMorOp: Eq + Clone;

    /// Type of object operations (proarrows) in the codomain theory.
    type CodObOp: Eq + Clone;

    /// Type of morphism operations (cells) in the codomain theory.
    type CodMorOp: Eq + Clone;

    /// Applies the mapping to an object in the domain theory.
    fn apply_ob(&self, x: &Self::DomOb) -> Option<Self::CodOb>;

    /// Applies the mapping to a morphism in the domain theory.
    fn apply_mor(&self, m: &Self::DomMor) -> Option<Self::CodMor>;

    /// Applies the mapping to an object in the domain theory.
    fn apply_ob_op(&self, x: &Self::DomObOp) -> Option<Self::CodObOp>;

    /// Applies the mapping to a morphism in the domain theory.
    fn apply_mor_op(&self, m: &Self::DomMorOp) -> Option<Self::CodMorOp>;

    /// Is the mapping defined at an object?
    fn is_ob_assigned(&self, x: &Self::DomOb) -> bool {
        self.apply_ob(x).is_some()
    }

    /// Is the mapping defined at a morphism?
    fn is_mor_assigned(&self, m: &Self::DomMor) -> bool {
        self.apply_mor(m).is_some()
    }

    /// Is the mapping defined at an object operation?
    fn is_ob_op_assigned(&self, x: &Self::DomObOp) -> bool {
        self.apply_ob_op(x).is_some()
    }

    /// Is the mapping defined at a morphism operation?
    fn is_mor_op_assigned(&self, m: &Self::DomMorOp) -> bool {
        self.apply_mor_op(m).is_some()
    }
}

/**
 * Finitely generated discrete double theories
 * are presented by a [FgCategory](crate::one::FgCategory).
 * There *are* Mor and MorOps, but only identities, which are identified with
 * the corresponding objects and object operations.
 */
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
pub struct FgDiscreteDblTheoryMapping<ObId, MorId>
where
    ObId: Clone + Eq + Hash,
    MorId: Clone + Eq + Hash,
{
    /** Mapping on objects */
    pub ob_map: HashColumn<ObId, ObId>,

    /** Mapping on morphisms */
    pub mor_map: HashColumn<MorId, MorId>,
}

impl<ObId, MorId> DblTheoryMapping for FgDiscreteDblTheoryMapping<ObId, MorId>
where
    ObId: Clone + Eq + Hash,
    MorId: Clone + Eq + Hash,
{
    type DomOb = ObId;
    type CodOb = ObId;
    type DomObOp = ObId;
    type CodObOp = ObId;
    type DomMor = MorId;
    type CodMor = MorId;
    type DomMorOp = MorId;
    type CodMorOp = MorId;
    fn apply_ob(&self, x: &ObId) -> Option<ObId> {
        self.ob_map.apply(x).cloned()
    }
    fn apply_ob_op(&self, x: &ObId) -> Option<ObId> {
        self.ob_map.apply(x).cloned()
    }
    fn apply_mor(&self, x: &MorId) -> Option<MorId> {
        self.mor_map.apply(x).cloned()
    }
    fn apply_mor_op(&self, x: &MorId) -> Option<MorId> {
        self.mor_map.apply(x).cloned()
    }
}

/** A functor between double theories defined by a [mapping](DblTheoryMapping).

This struct borrows its data to perform validation. The domain and codomain are
assumed to be valid double theories. If that is in question, the
models should be validated *before* validating this object.
 */
pub struct DblFunctor<'a, Map, Dom, Cod>(pub &'a Map, pub &'a Dom, pub &'a Cod);

/// A morphism between models of a discrete double theory.
pub type DiscreteDblTheoryMorphism<'a, DomCat, CodCat> = DblFunctor<
    'a,
    FgDiscreteDblTheoryMapping<<DomCat as FgCategory>::ObGen, <CodCat as FgCategory>::MorGen>,
    DiscreteDblTheory<DomCat>,
    DiscreteDblTheory<CodCat>,
>;

/*
Methods defined in the special case of two finitely generated categories which
have the the same types and special property of Ob=ObGen, Mor=FinMor. If the
constraint that the two categories have the same types is removed, then we lose
the ability for interpreting keys not found as unchanged names.
*/
impl<DomCat, CodCat> DiscreteDblTheoryMorphism<'_, DomCat, CodCat>
where
    DomCat: FgCategory<
        ObGen = <DomCat as Category>::Ob,
        Mor = FinMor<<DomCat as Category>::Ob, <DomCat as FgCategory>::MorGen>,
    >,
    CodCat: FgCategory<
        Ob = DomCat::Ob,
        Mor = DomCat::Mor,
        ObGen = DomCat::ObGen,
        MorGen = DomCat::MorGen,
    >,
    DomCat::ObGen: Hash,
    DomCat::MorGen: Hash,
{
    /**
    Push a discrete double model forward along a functor. This can result in
    an invalid model and in such cases one ought compute the free completion
    via, e.g., the chase. This creates a new model.

    In the future we could generate a model morphism, too. Alternatively, an
    imperative interface which mutates a model could be implemented.
    */
    pub fn pushforward(
        &self,
        cod_theory: Arc<DiscreteDblTheory<CodCat>>,
        dom_model: &DiscreteDblModel<DomCat::ObGen, DomCat>,
    ) -> DiscreteDblModel<CodCat::ObGen, CodCat> {
        // Empty model with the codomain theory
        let mut m: DiscreteDblModel<CodCat::ObGen, CodCat> = DiscreteDblModel::new(cod_theory);
        // Add pushed-forward object generators
        for o in dom_model.ob_generators() {
            let domtype = dom_model.ob_generator_type(&o.clone());
            let copy = domtype.clone();
            let codtype = self.0.ob_map.apply(&domtype.clone()).unwrap_or(&copy);
            m.add_ob(o, codtype.clone());
        }
        // Add pushed-forward morphism generators
        for f in dom_model.mor_generators() {
            let domtype = dom_model.mor_generator_type(&f);
            let dom = dom_model.mor_generator_dom(&f);
            let cod = dom_model.mor_generator_cod(&f);
            match domtype {
                FinMor::Id(x) => {
                    let fx = self.0.ob_map.apply(&x.clone()).unwrap_or(&x);
                    m.add_mor(f, dom, cod, FinMor::Id(fx.clone()))
                }
                FinMor::Generator(x) => {
                    let codtype = self.0.mor_map.apply(&x).unwrap_or(&x).clone();
                    m.add_mor(f, dom, cod, FinMor::Generator(codtype))
                }
            };
        }
        m
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::one::fin_category::FinMor;
    use crate::stdlib::*;
    use ustr::{ustr, Ustr};

    /*
    This test only uses ob_map of the FgDiscreteDblTheoryMapping
     */
    #[test]
    fn push_category_schema() {
        let t1 = Arc::new(th_category());
        let t2 = Arc::new(th_schema());

        // Define functor used for pushforward
        let mut v: FgDiscreteDblTheoryMapping<Ustr, _> = Default::default();
        let (obj, ent) = (ustr("Object"), ustr("Entity"));
        v.ob_map.set(obj, ent);
        let m: DiscreteDblTheoryMorphism<_, _> = DblFunctor(&v, &t1, &t2);

        // Make a model of walking arrow in ThCategory
        let mut model = DiscreteDblModel::new(t1.clone());
        let (a, b, f) = (ustr("a"), ustr("b"), ustr("f"));
        model.add_ob(a, obj);
        model.add_ob(b, obj);
        model.add_mor(f, a, b, FinMor::Id(obj));

        // Expected result of pushforward
        let mut expected = DiscreteDblModel::new(t2.clone());
        expected.add_ob(a, ent);
        expected.add_ob(b, ent);
        expected.add_mor(f, a, b, FinMor::Id(ent));

        assert_eq!(expected, m.pushforward(t2.clone(), &model));
    }

    /*
    Swap the positive and negative arrows of a delayable signed category
    No need to specify ob map - by default we assume no change if key not found.
    */
    #[test]
    fn swap_pos_neg_slow() {
        let t = Arc::new(th_delayable_signed_category());

        // Define functor used for pushforward
        let mut v: FgDiscreteDblTheoryMapping<Ustr, _> = Default::default();
        let obj = ustr("Object");
        let (pos_slow, neg_slow) = (ustr("PositiveSlow"), ustr("NegativeSlow"));
        v.mor_map.set(pos_slow, neg_slow);
        v.mor_map.set(neg_slow, pos_slow);
        let m: DiscreteDblTheoryMorphism<_, _> = DblFunctor(&v, &t, &t);

        // Make a model with arrows of all sorts
        let mut model = DiscreteDblModel::new(t.clone());
        let (x, z, p, n) = (ustr("x"), ustr("z"), ustr("p"), ustr("n"));
        model.add_ob(x, obj);
        model.add_mor(z, x, x, FinMor::Id(obj));
        model.add_mor(p, x, x, FinMor::Generator(pos_slow));
        model.add_mor(n, x, x, FinMor::Generator(neg_slow));

        // Expected result (p is now NegativeSlow, n is now PositiveSlow)
        let mut expected = DiscreteDblModel::new(t.clone());
        expected.add_ob(x, obj);
        expected.add_mor(z, x, x, FinMor::Id(obj));
        expected.add_mor(p, x, x, FinMor::Generator(neg_slow));
        expected.add_mor(n, x, x, FinMor::Generator(pos_slow));

        assert_eq!(expected, m.pushforward(t.clone(), &model));
    }
}
