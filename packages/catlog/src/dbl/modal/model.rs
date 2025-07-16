//! Models of modal double theories.

use std::fmt::Debug;
use std::hash::{BuildHasher, Hash, RandomState};
use std::rc::Rc;

use derive_more::From;
use itertools::Itertools;
use ref_cast::RefCast;

use super::theory::*;
use crate::dbl::VDblGraph;
use crate::dbl::model::{DblModel, FgDblModel, MutDblModel};
use crate::one::computad::*;
use crate::{one::*, zero::*};

/// Object in a model of a modal double theory.
#[derive(Clone, Debug, PartialEq, Eq, From)]
pub enum ModalOb<Id, ThId> {
    /// Generating object.
    #[from]
    Generator(Id),

    /// Application of a generating object operation.
    App(Box<Self>, ThId),

    /// List of objects in a [list modality](List).
    List(List, Vec<Self>),
}

/// Morphism is a model of a modal double theory.
#[derive(Clone, Debug, PartialEq, Eq, From)]
pub enum ModalMor<Id, ThId> {
    /// Generating morphism.
    #[from]
    Generator(Id),

    /// Composite of morphisms.
    Composite(Box<Path<ModalOb<Id, ThId>, Self>>),

    /// Application of a basic morphism operation.
    App(Box<Path<ModalOb<Id, ThId>, Self>>, ThId),

    /// Application of the hom operation on a basic object operation.
    HomApp(Box<Path<ModalOb<Id, ThId>, Self>>, ThId),

    /// List of morphisms.
    List(MorListData, Vec<Self>),
}

/// Extra data associated with a list of morphisms in a [list modality](List).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MorListData {
    /// No extra data for a morphism in the [plain list](List::Plain) modality.
    Plain(),

    /** Data for a morphism in the [symmetric list](List::Symmetric) modality.

    A permutation on the indexing set of the list, which acts on the list of
    codomain objects.
     */
    Symmetric(SkelColumn),
}

impl MorListData {
    fn list_type(&self) -> List {
        match self {
            MorListData::Plain() => List::Plain,
            MorListData::Symmetric(..) => List::Symmetric,
        }
    }
}

/// A model of a modal double theory.
#[derive(Clone)]
pub struct ModalDblModel<Id, ThId, S = RandomState> {
    theory: Rc<ModalDblTheory<ThId, S>>,
    ob_generators: HashFinSet<Id>,
    mor_generators: ComputadTop<ModalOb<Id, ThId>, Id>,
    // TODO: Equations
    ob_types: HashColumn<Id, ModalObType<ThId>>,
    mor_types: HashColumn<Id, ModalMorType<ThId>>,
}

impl<Id, ThId, S> ModalDblModel<Id, ThId, S> {
    /// Creates an empty model of the given theory.
    pub fn new(theory: Rc<ModalDblTheory<ThId, S>>) -> Self {
        Self {
            theory,
            ob_generators: Default::default(),
            mor_generators: Default::default(),
            ob_types: Default::default(),
            mor_types: Default::default(),
        }
    }

    /// Gets the computing generating the morphisms of the model.
    fn computad(&self) -> Computad<'_, ModalOb<Id, ThId>, ModalDblModelObs<Id, ThId, S>, Id> {
        Computad::new(ModalDblModelObs::ref_cast(self), &self.mor_generators)
    }
}

#[derive(RefCast)]
#[repr(transparent)]
struct ModalDblModelObs<Id, ThId, S>(ModalDblModel<Id, ThId, S>);

impl<Id, ThId, S> Set for ModalDblModelObs<Id, ThId, S>
where
    Id: Eq + Clone + Hash + Debug,
    ThId: Eq + Clone + Hash + Debug,
    S: BuildHasher,
{
    type Elem = ModalOb<Id, ThId>;

    fn contains(&self, ob: &Self::Elem) -> bool {
        match ob {
            ModalOb::Generator(id) => self.0.ob_generators.contains(id),
            ModalOb::App(x, op_id) => {
                self.contains(x) && self.0.ob_type(x) == self.0.theory.tight_computad().src(op_id)
            }
            ModalOb::List(_, xs) => xs.iter().all(|x| self.contains(x)),
        }
    }
}

impl<Id, ThId, S> Category for ModalDblModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash + Debug,
    ThId: Eq + Clone + Hash + Debug,
    S: BuildHasher,
{
    type Ob = ModalOb<Id, ThId>;
    type Mor = ModalMor<Id, ThId>;

    fn has_ob(&self, ob: &Self::Ob) -> bool {
        ModalDblModelObs::ref_cast(self).contains(ob)
    }
    fn has_mor(&self, mor: &Self::Mor) -> bool {
        let graph = UnderlyingGraph::ref_cast(self);
        match mor {
            ModalMor::Generator(id) => self.computad().has_edge(id),
            ModalMor::Composite(path) => path.contained_in(graph),
            // TODO: Check morphism type equals domain of operation.
            ModalMor::App(path, _) | ModalMor::HomApp(path, _) => path.contained_in(graph),
            ModalMor::List(MorListData::Plain(), fs) => fs.iter().all(|f| self.has_mor(f)),
            ModalMor::List(MorListData::Symmetric(sigma), fs) => {
                sigma.is_permutation(fs.len()) && fs.iter().all(|f| self.has_mor(f))
            }
        }
    }

    fn dom(&self, mor: &Self::Mor) -> Self::Ob {
        let graph = UnderlyingGraph::ref_cast(self);
        match mor {
            ModalMor::Generator(id) => self.computad().src(id),
            ModalMor::Composite(path) => path.src(graph),
            ModalMor::App(path, op_id) => {
                self.ob_act(path.src(graph), &self.theory.dbl_computad().square_src(op_id))
            }
            ModalMor::HomApp(path, op_id) => {
                ModalOp::from(op_id.clone()).ob_act(path.src(graph)).unwrap()
            }
            ModalMor::List(data, fs) => {
                ModalOb::List(data.list_type(), fs.iter().map(|f| self.dom(f)).collect())
            }
        }
    }

    fn cod(&self, mor: &Self::Mor) -> Self::Ob {
        let graph = UnderlyingGraph::ref_cast(self);
        match mor {
            ModalMor::Generator(id) => self.computad().tgt(id),
            ModalMor::Composite(path) => path.tgt(graph),
            ModalMor::App(path, op_id) => {
                self.ob_act(path.tgt(graph), &self.theory.dbl_computad().square_tgt(op_id))
            }
            ModalMor::HomApp(path, op_id) => {
                ModalOp::from(op_id.clone()).ob_act(path.tgt(graph)).unwrap()
            }
            ModalMor::List(MorListData::Plain(), fs) => {
                ModalOb::List(List::Plain, fs.iter().map(|f| self.cod(f)).collect())
            }
            ModalMor::List(MorListData::Symmetric(sigma), fs) => {
                ModalOb::List(List::Symmetric, sigma.values().map(|j| self.cod(&fs[*j])).collect())
            }
        }
    }

    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor {
        // TODO: Normalize composites of lists by composing elementwise.
        ModalMor::Composite(path.into())
    }
}

impl<Id, ThId, S> FgCategory for ModalDblModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash + Debug,
    ThId: Eq + Clone + Hash + Debug,
    S: BuildHasher,
{
    type ObGen = Id;
    type MorGen = Id;

    fn ob_generators(&self) -> impl Iterator<Item = Self::ObGen> {
        self.ob_generators.iter()
    }
    fn mor_generators(&self) -> impl Iterator<Item = Self::MorGen> {
        self.mor_generators.edge_set.iter()
    }
    fn mor_generator_dom(&self, f: &Self::MorGen) -> Self::Ob {
        self.computad().src(f)
    }
    fn mor_generator_cod(&self, f: &Self::MorGen) -> Self::Ob {
        self.computad().tgt(f)
    }
}

impl<Id, ThId, S> DblModel for ModalDblModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash + Debug,
    ThId: Eq + Clone + Hash + Debug,
    S: BuildHasher,
{
    type ObType = ModalObType<ThId>;
    type MorType = ModalMorType<ThId>;
    type ObOp = ModalObOp<ThId>;
    type MorOp = ModalMorOp<ThId>;
    type Theory = ModalDblTheory<ThId, S>;

    fn theory(&self) -> &Self::Theory {
        &self.theory
    }

    fn ob_type(&self, ob: &Self::Ob) -> Self::ObType {
        match ob {
            ModalOb::Generator(id) => self.ob_generator_type(id),
            ModalOb::App(_, op_id) => self.theory.tight_computad().tgt(op_id),
            ModalOb::List(list_type, vec) => vec
                .iter()
                .map(|ob| self.ob_type(ob))
                .all_equal_value()
                .expect("All objects in list should have the same type")
                .apply((*list_type).into()),
        }
    }

    fn mor_type(&self, mor: &Self::Mor) -> Self::MorType {
        match mor {
            ModalMor::Generator(id) => self.mor_generator_type(id),
            ModalMor::Composite(_) => panic!("Composites not implemented"),
            ModalMor::App(_, op_id) => self.theory.dbl_computad().square_cod(op_id),
            ModalMor::HomApp(_, op_id) => ShortPath::Zero(self.theory.tight_computad().tgt(op_id)),
            ModalMor::List(data, fs) => fs
                .iter()
                .map(|mor| self.mor_type(mor))
                .all_equal_value()
                .expect("All morphisms in list should have the same type")
                .apply(data.list_type().into()),
        }
    }

    fn ob_act(&self, ob: Self::Ob, path: &Self::ObOp) -> Self::Ob {
        path.iter().cloned().fold(ob, |ob, op| op.ob_act(ob).unwrap())
    }

    fn mor_act(&self, path: Path<Self::Ob, Self::Mor>, tree: &Self::MorOp) -> Self::Mor {
        let (Some(mor), Some(node)) = (path.only(), tree.clone().only()) else {
            panic!("Morphism action only implemented for basic operations");
        };
        match node {
            ModalNode::Basic(op) => op.mor_act(mor, false).unwrap(),
            ModalNode::Unit(op) => op.mor_act(mor, true).unwrap(),
            ModalNode::Composite(_) => mor,
        }
    }
}

impl<Id, ThId, S> FgDblModel for ModalDblModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash + Debug,
    ThId: Eq + Clone + Hash + Debug,
    S: BuildHasher,
{
    fn ob_generator_type(&self, id: &Self::ObGen) -> Self::ObType {
        self.ob_types.apply_to_ref(id).expect("Object should have object type")
    }
    fn mor_generator_type(&self, id: &Self::MorGen) -> Self::MorType {
        self.mor_types.apply_to_ref(id).expect("Morphism should have morphism type")
    }
    fn ob_generators_with_type(&self, typ: &Self::ObType) -> impl Iterator<Item = Self::ObGen> {
        self.ob_types.preimage(typ)
    }
    fn mor_generators_with_type(&self, typ: &Self::MorType) -> impl Iterator<Item = Self::MorGen> {
        self.mor_types.preimage(typ)
    }
}

impl<Id, ThId, S> MutDblModel for ModalDblModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash + Debug,
    ThId: Eq + Clone + Hash + Debug,
    S: BuildHasher,
{
    fn add_ob(&mut self, x: Self::ObGen, ob_type: Self::ObType) {
        self.ob_types.set(x.clone(), ob_type);
        self.ob_generators.insert(x);
    }
    fn add_mor(&mut self, f: Self::MorGen, dom: Self::Ob, cod: Self::Ob, mor_type: Self::MorType) {
        self.mor_types.set(f.clone(), mor_type);
        self.mor_generators.add_edge(f, dom, cod);
    }
    fn make_mor(&mut self, f: Self::MorGen, mor_type: Self::MorType) {
        self.mor_types.set(f.clone(), mor_type);
        self.mor_generators.edge_set.insert(f);
    }

    fn get_dom(&self, f: &Self::MorGen) -> Option<&Self::Ob> {
        self.mor_generators.src_map.get(f)
    }
    fn get_cod(&self, f: &Self::MorGen) -> Option<&Self::Ob> {
        self.mor_generators.tgt_map.get(f)
    }
    fn set_dom(&mut self, f: Self::MorGen, x: Self::Ob) {
        self.mor_generators.tgt_map.set(f, x);
    }
    fn set_cod(&mut self, f: Self::MorGen, x: Self::Ob) {
        self.mor_generators.tgt_map.set(f, x);
    }
}

impl<ThId> ModeApp<ModalOp<ThId>>
where
    ThId: Clone,
{
    fn ob_act<Id>(mut self, ob: ModalOb<Id, ThId>) -> Result<ModalOb<Id, ThId>, String> {
        match self.modalities.pop() {
            Some(Modality::List(list_type)) => {
                if let ModalOb::List(other_type, vec) = ob
                    && other_type == list_type
                {
                    let maybe_vec: Result<Vec<_>, _> =
                        vec.into_iter().map(|ob| self.clone().ob_act(ob)).collect();
                    Ok(ModalOb::List(list_type, maybe_vec?))
                } else {
                    Err(format!("Object should be a list of type {list_type:?}"))
                }
            }
            Some(Modality::Discrete()) | Some(Modality::Codiscrete()) | None => self.arg.ob_act(ob),
        }
    }

    fn mor_act<Id>(
        mut self,
        mor: ModalMor<Id, ThId>,
        is_unit: bool,
    ) -> Result<ModalMor<Id, ThId>, String> {
        match self.modalities.pop() {
            Some(Modality::List(list_type)) => {
                if let ModalMor::List(data, vec) = mor
                    && data.list_type() == list_type
                {
                    let maybe_vec: Result<Vec<_>, _> =
                        vec.into_iter().map(|mor| self.clone().mor_act(mor, is_unit)).collect();
                    Ok(ModalMor::List(data, maybe_vec?))
                } else {
                    Err(format!("Morphism should be a list of type {list_type:?}"))
                }
            }
            Some(modality) => panic!("Modality {modality:?} is not implemented"),
            None => self.arg.mor_act(mor, is_unit),
        }
    }
}

impl<ThId> ModalOp<ThId> {
    fn ob_act<Id>(self, ob: ModalOb<Id, ThId>) -> Result<ModalOb<Id, ThId>, String> {
        match self {
            ModalOp::Generator(id) => Ok(ModalOb::App(Box::new(ob), id)),
            ModalOp::Concat(list_type, n, _) => {
                Ok(ModalOb::List(list_type, flatten_ob_list(ob, list_type, n)?))
            }
        }
    }

    fn mor_act<Id>(
        self,
        mor: ModalMor<Id, ThId>,
        is_unit: bool,
    ) -> Result<ModalMor<Id, ThId>, String> {
        match self {
            ModalOp::Generator(id) => Ok(if is_unit {
                ModalMor::HomApp(Box::new(mor.into()), id)
            } else {
                ModalMor::App(Box::new(mor.into()), id)
            }),
            ModalOp::Concat(list_type, n, _) => match list_type {
                List::Plain => Ok(ModalMor::List(MorListData::Plain(), flatten_mor_list(mor, n)?)),
                _ => panic!("Flattening of functions is not implemented"),
            },
        }
    }
}

/// Recursively flatten a nested list of objects of the given depth.
fn flatten_ob_list<Id, ThId>(
    ob: ModalOb<Id, ThId>,
    list_type: List,
    depth: usize,
) -> Result<Vec<ModalOb<Id, ThId>>, String> {
    if depth == 0 {
        Ok(vec![ob])
    } else if let ModalOb::List(other_type, vec) = ob
        && other_type == list_type
    {
        if depth == 1 {
            Ok(vec)
        } else {
            let maybe_vec: Result<Vec<_>, _> =
                vec.into_iter().map(|ob| flatten_ob_list(ob, list_type, depth - 1)).collect();
            Ok(maybe_vec?.into_iter().flatten().collect())
        }
    } else {
        Err(format!("Object should be a list of type {list_type:?}"))
    }
}

/// Recursively flatten a nested list of morphisms of the given depth.
fn flatten_mor_list<Id, ThId>(
    mor: ModalMor<Id, ThId>,
    depth: usize,
) -> Result<Vec<ModalMor<Id, ThId>>, String> {
    if depth == 0 {
        Ok(vec![mor])
    } else if let ModalMor::List(MorListData::Plain(), vec) = mor {
        if depth == 1 {
            Ok(vec)
        } else {
            let maybe_vec: Result<Vec<_>, _> =
                vec.into_iter().map(|mor| flatten_mor_list(mor, depth - 1)).collect();
            Ok(maybe_vec?.into_iter().flatten().collect())
        }
    } else {
        Err(format!("Morphism should be a list of type {:?}", List::Plain))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dbl::theory::DblTheory;
    use crate::stdlib::theories::*;
    use crate::{dbl::tree::DblNode, one::tree::OpenTree};
    use ustr::ustr;

    #[test]
    fn monoidal_category() {
        let th = Rc::new(th_monoidal_category());
        let ob_type = ModeApp::new(ustr("Object"));

        // Lists of objects.
        let mut model = ModalDblModel::new(th.clone());
        let (w, x, y, z) = (ustr("w"), ustr("x"), ustr("y"), ustr("z"));
        model.add_ob(x, ob_type.clone());
        model.add_ob(y, ob_type.clone());
        assert!(model.has_ob(&x.into()));
        let pair = ModalOb::List(List::Plain, vec![x.into(), y.into()]);
        assert!(model.has_ob(&pair));
        assert!(!model.has_ob(&ModalOb::List(List::Plain, vec![x.into(), z.into()])));

        // Nested lists of objects.
        model.add_ob(w, ob_type.clone());
        model.add_ob(z, ob_type.clone());
        let pairs = ModalOb::List(
            List::Plain,
            vec![
                ModalOb::List(List::Plain, vec![w.into(), x.into()]),
                ModalOb::List(List::Plain, vec![y.into(), z.into()]),
            ],
        );
        assert!(model.has_ob(&pairs));
        assert_eq!(
            model.ob_act(pairs, &ModalObOp::concat(List::Plain, 2, ob_type.clone())),
            ModalOb::List(List::Plain, vec![w.into(), x.into(), y.into(), z.into()])
        );
        assert_eq!(
            model.ob_act(x.into(), &ModalObOp::concat(List::Plain, 0, ob_type.clone())),
            ModalOb::List(List::Plain, vec![x.into()])
        );

        // Products of objects.
        assert_eq!(model.ob_type(&pair), ob_type.clone().apply(List::Plain.into()));
        let mul_op = ModalObOp::generator(ustr("Mul"));
        let prod = model.ob_act(pair, &mul_op);
        assert!(model.has_ob(&prod));
        assert_eq!(model.ob_type(&prod), ob_type);

        // Lists of morphisms.
        let (f, g) = (ustr("f"), ustr("g"));
        model.add_mor(f, x.into(), y.into(), th.hom_type(ob_type.clone()));
        model.add_mor(g, w.into(), z.into(), th.hom_type(ob_type.clone()));
        assert!(model.has_mor(&f.into()));
        let pair = ModalMor::List(MorListData::Plain(), vec![f.into(), g.into()]);
        assert!(model.has_mor(&pair));
        assert_eq!(model.mor_type(&pair), th.hom_type(ob_type.clone().apply(List::Plain.into())));
        let dom_list = ModalOb::List(List::Plain, vec![x.into(), w.into()]);
        let cod_list = ModalOb::List(List::Plain, vec![y.into(), z.into()]);
        assert_eq!(model.dom(&pair), dom_list);
        assert_eq!(model.cod(&pair), cod_list);

        // Products of morphisms.
        let ob_op = ModeApp::new(ustr("Mul").into());
        let hom_op = OpenTree::single(DblNode::Cell(ModalNode::Unit(ob_op)), 1).into();
        let prod = model.mor_act(pair.into(), &hom_op);
        assert!(model.has_mor(&prod));
        assert_eq!(model.mor_type(&prod), th.hom_type(ob_type.clone()));
        assert_eq!(model.dom(&prod), model.ob_act(dom_list, &mul_op));
        assert_eq!(model.cod(&prod), model.ob_act(cod_list, &mul_op));
    }

    #[test]
    fn sym_monoidal_category() {
        let th = Rc::new(th_sym_monoidal_category());
        let ob_type = ModeApp::new(ustr("Object"));

        // Lists of morphisms, with permutation.
        let mut model = ModalDblModel::new(th.clone());
        let (w, x, y, z, f, g) = (ustr("w"), ustr("x"), ustr("y"), ustr("z"), ustr("f"), ustr("g"));
        for id in [w, x, y, z] {
            model.add_ob(id, ob_type.clone());
        }
        model.add_mor(f, x.into(), y.into(), th.hom_type(ob_type.clone()));
        model.add_mor(g, w.into(), z.into(), th.hom_type(ob_type.clone()));
        let pair = ModalMor::List(
            MorListData::Symmetric(SkelColumn::new(vec![1, 0])),
            vec![f.into(), g.into()],
        );
        assert!(model.has_mor(&pair));
        assert_eq!(model.dom(&pair), ModalOb::List(List::Symmetric, vec![x.into(), w.into()]));
        assert_eq!(model.cod(&pair), ModalOb::List(List::Symmetric, vec![z.into(), y.into()]));
        // Bad permutation.
        let pair = ModalMor::List(
            MorListData::Symmetric(SkelColumn::new(vec![0, 0])),
            vec![f.into(), g.into()],
        );
        assert!(!model.has_mor(&pair));
    }
}
