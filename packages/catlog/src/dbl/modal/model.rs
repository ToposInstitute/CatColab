//! Models of modal double theories.

use std::fmt::Debug;
use std::hash::{BuildHasher, Hash, RandomState};
use std::rc::Rc;

use derive_more::From;
use itertools::Itertools;
use ref_cast::RefCast;

use super::theory::*;
use crate::dbl::VDblGraph;
use crate::dbl::model::DblModel;
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

    /// List of objects in the [`List`](Mode::List) mode or one of its variants.
    List(Mode, Vec<Self>),
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
    #[from]
    List(MorList<Id, ThId>),
}

/** A list of morphism in a model of a modal double theory.

These are morphisms in the model with morphism types of the various list modes.
 */
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MorList<Id, ThId> {
    /// A morphism in the [`List`](Mode::List) mode.
    List(Vec<ModalMor<Id, ThId>>),

    /** A morphism in the [`SymList`](Mode::SymList) mode.

    The mapping should be a permutation on the indexing set of the list.
     */
    SymList(Vec<ModalMor<Id, ThId>>, SkelColumn),
}

impl<Id, ThId> MorList<Id, ThId> {
    fn list(&self) -> &Vec<ModalMor<Id, ThId>> {
        match self {
            MorList::List(vec) => vec,
            MorList::SymList(vec, _) => vec,
        }
    }

    fn mode(&self) -> Mode {
        match self {
            MorList::List(..) => Mode::List,
            MorList::SymList(..) => Mode::SymList,
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
            ModalMor::List(MorList::List(fs)) => fs.iter().all(|f| self.has_mor(f)),
            ModalMor::List(MorList::SymList(fs, sigma)) => {
                sigma.is_permutation(fs.len()) && fs.iter().all(|f| self.has_mor(f))
            }
        }
    }

    fn dom(&self, mor: &Self::Mor) -> Self::Ob {
        let graph = UnderlyingGraph::ref_cast(self);
        match mor {
            ModalMor::Generator(id) => self.computad().src(id),
            ModalMor::Composite(path) => path.src(graph),
            ModalMor::App(_, _) => panic!("TODO"),
            ModalMor::HomApp(path, op_id) => ModalOp::from(op_id.clone()).ob_act(path.src(graph)),
            ModalMor::List(mor_list) => ModalOb::List(
                mor_list.mode(),
                mor_list.list().iter().map(|f| self.dom(f)).collect(),
            ),
        }
    }

    fn cod(&self, mor: &Self::Mor) -> Self::Ob {
        let graph = UnderlyingGraph::ref_cast(self);
        match mor {
            ModalMor::Generator(id) => self.computad().tgt(id),
            ModalMor::Composite(path) => path.tgt(graph),
            ModalMor::App(_, _) => panic!("TODO"),
            ModalMor::HomApp(path, op_id) => ModalOp::from(op_id.clone()).ob_act(path.tgt(graph)),
            ModalMor::List(MorList::List(fs)) => {
                ModalOb::List(Mode::List, fs.iter().map(|f| self.cod(f)).collect())
            }
            ModalMor::List(MorList::SymList(fs, sigma)) => {
                ModalOb::List(Mode::SymList, sigma.values().map(|j| self.cod(&fs[*j])).collect())
            }
        }
    }

    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor {
        ModalMor::Composite(path.into())
    }
}

impl<ThId> ModeApp<ModalOp<ThId>>
where
    ThId: Clone,
{
    fn ob_act<Id>(mut self, ob: ModalOb<Id, ThId>) -> ModalOb<Id, ThId> {
        if let Some(mode) = self.modes.pop() {
            if let ModalOb::List(other_mode, vec) = ob
                && other_mode == mode
            {
                ModalOb::List(mode, vec.into_iter().map(|ob| self.clone().ob_act(ob)).collect())
            } else {
                panic!("TODO")
            }
        } else {
            self.arg.ob_act(ob)
        }
    }
}

impl<ThId> ModalOp<ThId> {
    fn ob_act<Id>(self, ob: ModalOb<Id, ThId>) -> ModalOb<Id, ThId> {
        match self {
            ModalOp::Generator(id) => ModalOb::App(ob.into(), id),
            ModalOp::Mul(mode, n, _) => ModalOb::List(mode, flatten_ob(ob, mode, n)),
        }
    }
}

/// Recursively flatten a nested list of objects of the given depth.
fn flatten_ob<Id, ThId>(ob: ModalOb<Id, ThId>, mode: Mode, depth: usize) -> Vec<ModalOb<Id, ThId>> {
    if depth == 0 {
        vec![ob]
    } else if let ModalOb::List(other_mode, vec) = ob
        && other_mode == mode
    {
        if depth == 1 {
            vec
        } else {
            vec.into_iter().flat_map(|ob| flatten_ob(ob, mode, depth - 1)).collect()
        }
    } else {
        panic!("TODO")
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
            ModalOb::Generator(id) => {
                self.ob_types.apply_to_ref(id).expect("Object should have object type")
            }
            ModalOb::App(_, op_id) => self.theory.tight_computad().tgt(op_id),
            ModalOb::List(mode, vec) => vec
                .iter()
                .map(|ob| self.ob_type(ob))
                .all_equal_value()
                .expect("All objects in list should have the same type")
                .apply(*mode),
        }
    }

    fn mor_type(&self, mor: &Self::Mor) -> Self::MorType {
        match mor {
            ModalMor::Generator(id) => {
                self.mor_types.apply_to_ref(id).expect("Morphism should have morphism type")
            }
            ModalMor::Composite(_) => panic!("Composites not implemented"),
            ModalMor::App(_, op_id) => self.theory.dbl_computad().square_cod(op_id),
            ModalMor::HomApp(_, op_id) => ShortPath::Zero(self.theory.tight_computad().tgt(op_id)),
            ModalMor::List(mor_list) => mor_list
                .list()
                .iter()
                .map(|mor| self.mor_type(mor))
                .all_equal_value()
                .expect("All morphisms in list should have the same type")
                .apply(mor_list.mode()),
        }
    }

    fn ob_act(&self, ob: Self::Ob, path: &Self::ObOp) -> Self::Ob {
        path.iter().cloned().fold(ob, |ob, op| op.ob_act(ob))
    }

    fn mor_act(&self, _mor: Self::Mor, _tree: &Self::MorOp) -> Self::Mor {
        panic!("Action on morphisms not implemented")
    }
}
