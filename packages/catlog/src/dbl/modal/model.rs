//! Models of modal double theories.

use std::fmt::Debug;
use std::rc::Rc;

use derive_more::From;
use itertools::Itertools;
use ref_cast::RefCast;

use super::theory::*;
use crate::dbl::graph::VDblGraph;
use crate::dbl::model::{DblModel, FgDblModel, InvalidDblModel, MutDblModel};
use crate::dbl::theory::DblTheory;
use crate::validate::{self, Validate};
use crate::{one::computad::*, one::*, zero::*};

/// Object in a model of a modal double theory.
#[derive(Clone, Debug, PartialEq, Eq, From)]
pub enum ModalOb {
    /// Generating object.
    #[from]
    Generator(QualifiedName),

    /// Application of a generating object operation.
    App(Box<Self>, QualifiedName),

    /// List of objects in a [list modality](List).
    List(List, Vec<Self>),
}

/// Morphism is a model of a modal double theory.
#[derive(Clone, Debug, PartialEq, Eq, From)]
pub enum ModalMor {
    /// Generating morphism.
    #[from]
    Generator(QualifiedName),

    /// Composite of morphisms.
    Composite(Box<Path<ModalOb, Self>>),

    /// Application of a basic morphism operation.
    App(Box<Path<ModalOb, Self>>, QualifiedName),

    /// Application of the hom operation on a basic object operation.
    HomApp(Box<Path<ModalOb, Self>>, QualifiedName),

    /// List of morphisms.
    List(MorListData, Vec<Self>),
}

/// Extra data associated with a list of morphisms in a [list modality](List).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MorListData {
    /// No extra data for a morphism in the [plain list](List::Plain) modality.
    Plain(),

    /// Data for a morphism in the [symmetric list](List::Symmetric) modality.
    ///
    /// A permutation on the indexing set of the list, which acts on the list of
    /// codomain objects.
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
pub struct ModalDblModel {
    theory: Rc<ModalDblTheory>,
    ob_generators: HashFinSet<QualifiedName>,
    mor_generators: ComputadTop<ModalOb, QualifiedName>,
    // TODO: Equations
    ob_types: HashColumn<QualifiedName, ModalObType>,
    mor_types: HashColumn<QualifiedName, ModalMorType>,
}

impl ModalDblModel {
    /// Creates an empty model of the given theory.
    pub fn new(theory: Rc<ModalDblTheory>) -> Self {
        Self {
            theory,
            ob_generators: Default::default(),
            mor_generators: Default::default(),
            ob_types: Default::default(),
            mor_types: Default::default(),
        }
    }

    /// Gets the computing generating the morphisms of the model.
    fn computad(&self) -> Computad<'_, ModalOb, ModalDblModelObs, QualifiedName> {
        Computad::new(ModalDblModelObs::ref_cast(self), &self.mor_generators)
    }
}

#[derive(RefCast)]
#[repr(transparent)]
struct ModalDblModelObs(ModalDblModel);

impl Set for ModalDblModelObs {
    type Elem = ModalOb;

    fn contains(&self, ob: &Self::Elem) -> bool {
        match ob {
            ModalOb::Generator(id) => self.0.ob_generators.contains(id),
            ModalOb::App(x, op_id) => {
                self.contains(x)
                    && self.0.ob_has_type(x, &self.0.theory.tight_computad().src(op_id))
            }
            ModalOb::List(_, xs) => xs.iter().all(|x| self.contains(x)),
        }
    }
}

impl Category for ModalDblModel {
    type Ob = ModalOb;
    type Mor = ModalMor;

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

impl FgCategory for ModalDblModel {
    type ObGen = QualifiedName;
    type MorGen = QualifiedName;

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

impl DblModel for ModalDblModel {
    type ObType = ModalObType;
    type MorType = ModalMorType;
    type ObOp = ModalObOp;
    type MorOp = ModalMorOp;
    type Theory = ModalDblTheory;

    fn theory(&self) -> Rc<Self::Theory> {
        self.theory.clone()
    }

    fn ob_type(&self, ob: &Self::Ob) -> Self::ObType {
        Option::from(self.infer_ob_type(ob).unwrap()).expect("Object type should be known")
    }

    fn mor_type(&self, mor: &Self::Mor) -> Self::MorType {
        Option::from(self.infer_mor_type(mor).unwrap()).expect("Morphism type should be known")
    }

    fn ob_act(&self, ob: Self::Ob, path: &Self::ObOp) -> Self::Ob {
        path.clone().ob_act(ob).unwrap()
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

impl FgDblModel for ModalDblModel {
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

impl MutDblModel for ModalDblModel {
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
        self.mor_generators.src_map.set(f, x);
    }
    fn set_cod(&mut self, f: Self::MorGen, x: Self::Ob) {
        self.mor_generators.tgt_map.set(f, x);
    }
}

impl Validate for ModalDblModel {
    type ValidationError = InvalidDblModel;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        let ob_gen_errors = self.ob_generators.iter().filter_map(|x| {
            if self.ob_types.apply_to_ref(&x).is_none_or(|typ| !self.theory.has_ob_type(&typ)) {
                Some(InvalidDblModel::ObType(x))
            } else {
                None
            }
        });
        validate::wrap_errors(ob_gen_errors)?;

        let computad = self.computad();
        let mor_gen_errors = computad.edge_set().iter().flat_map(|f| {
            let mut errors = Vec::new();
            let mor_type = self.mor_types.apply_to_ref(&f).filter(|m| self.theory.has_mor_type(m));
            if let Some(ob) = computad.src_map().apply_to_ref(&f)
                && self.has_ob(&ob)
            {
                if mor_type
                    .as_ref()
                    .is_some_and(|m| !self.ob_has_type(&ob, &self.theory.src_type(m)))
                {
                    errors.push(InvalidDblModel::DomType(f.clone()))
                }
            } else {
                errors.push(InvalidDblModel::Dom(f.clone()))
            }
            if let Some(ob) = computad.tgt_map().apply_to_ref(&f)
                && self.has_ob(&ob)
            {
                if mor_type
                    .as_ref()
                    .is_some_and(|m| !self.ob_has_type(&ob, &self.theory.tgt_type(m)))
                {
                    errors.push(InvalidDblModel::CodType(f.clone()))
                }
            } else {
                errors.push(InvalidDblModel::Cod(f.clone()))
            }
            if mor_type.is_none() {
                errors.push(InvalidDblModel::MorType(f))
            }
            errors
        });
        validate::wrap_errors(mor_gen_errors)
    }
}

#[derive(From)]
enum InferredType<T> {
    #[from]
    Type(T),
    Unknown,
}

impl<T> From<InferredType<T>> for Option<T> {
    fn from(value: InferredType<T>) -> Self {
        match value {
            InferredType::Type(value) => Some(value),
            InferredType::Unknown => None,
        }
    }
}

impl ModalDblModel {
    /// Tries to infer the type of an object in the model.
    fn infer_ob_type(&self, ob: &ModalOb) -> Result<InferredType<ModalObType>, String> {
        match ob {
            ModalOb::Generator(id) => Ok(self.ob_generator_type(id).into()),
            ModalOb::App(_, op_id) => Ok(self.theory.tight_computad().tgt(op_id).into()),
            ModalOb::List(list_type, vec) => {
                let inferred_types: Result<Vec<_>, _> =
                    vec.iter().map(|ob| self.infer_ob_type(ob)).collect();
                let unique_type = inferred_types?
                    .into_iter()
                    .filter_map(Option::<ModalObType>::from)
                    .all_equal_value();
                match unique_type {
                    Ok(ob_type) => Ok(ob_type.apply((*list_type).into()).into()),
                    Err(Some(_)) => Err("All objects in list should have the same type".into()),
                    Err(None) => Ok(InferredType::Unknown),
                }
            }
        }
    }

    /// Tries to infer the type of a morphism in the model.
    fn infer_mor_type(&self, mor: &ModalMor) -> Result<InferredType<ModalMorType>, String> {
        match mor {
            ModalMor::Generator(id) => Ok(self.mor_generator_type(id).into()),
            ModalMor::Composite(_) => panic!("Composites not implemented"),
            ModalMor::App(_, op_id) => Ok(self.theory.dbl_computad().square_cod(op_id).into()),
            ModalMor::HomApp(_, op_id) => {
                Ok(ShortPath::Zero(self.theory.tight_computad().tgt(op_id)).into())
            }
            ModalMor::List(data, vec) => {
                let inferred_types: Result<Vec<_>, _> =
                    vec.iter().map(|mor| self.infer_mor_type(mor)).collect();
                let unique_type = inferred_types?
                    .into_iter()
                    .filter_map(Option::<ModalMorType>::from)
                    .all_equal_value();
                match unique_type {
                    Ok(mor_type) => Ok(mor_type.apply(data.list_type().into()).into()),
                    Err(Some(_)) => Err("All morphisms in list should have the same type".into()),
                    Err(None) => Ok(InferredType::Unknown),
                }
            }
        }
    }

    /// Does the object have the given type?
    fn ob_has_type(&self, ob: &ModalOb, ob_type: &ModalObType) -> bool {
        if let ModalOb::List(list_type, vec) = ob
            && vec.is_empty()
        {
            // XXX: This is bandaid due to lack of type unification.
            return ob_type.modalities.last() == Some(&Modality::List(*list_type));
        }
        match self.infer_ob_type(ob) {
            Ok(InferredType::Type(other_type)) => other_type == *ob_type,
            _ => false,
        }
    }
}

impl ModalObOp {
    /// Acts on an object in a model of a modal theory.
    pub fn ob_act(self, ob: ModalOb) -> Result<ModalOb, String> {
        self.into_iter().try_fold(ob, |ob, op| op.ob_act(ob))
    }
}

impl ModeApp<ModalOp> {
    fn ob_act(mut self, ob: ModalOb) -> Result<ModalOb, String> {
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

    fn mor_act(mut self, mor: ModalMor, is_unit: bool) -> Result<ModalMor, String> {
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

impl ModalOp {
    fn ob_act(self, ob: ModalOb) -> Result<ModalOb, String> {
        match self {
            ModalOp::Generator(id) => Ok(ModalOb::App(Box::new(ob), id)),
            ModalOp::Concat(list_type, n, _) => {
                Ok(ModalOb::List(list_type, ob.flatten_list(list_type, n)?))
            }
        }
    }

    fn mor_act(self, mor: ModalMor, is_unit: bool) -> Result<ModalMor, String> {
        match self {
            ModalOp::Generator(id) => Ok(if is_unit {
                ModalMor::HomApp(Box::new(mor.into()), id)
            } else {
                ModalMor::App(Box::new(mor.into()), id)
            }),
            ModalOp::Concat(list_type, n, _) => match list_type {
                List::Plain => Ok(ModalMor::List(MorListData::Plain(), mor.flatten_list(n)?)),
                _ => panic!("Flattening of functions is not implemented"),
            },
        }
    }
}

impl ModalOb {
    /// Extracts an object generator or nothing.
    pub fn generator(self) -> Option<QualifiedName> {
        match self {
            ModalOb::Generator(id) => Some(id),
            _ => None,
        }
    }

    /// Unwraps an object generator, or panics.
    pub fn unwrap_generator(self) -> QualifiedName {
        self.generator().expect("Object should be a generator")
    }

    /// Collects application of a product operation into a list of objects.
    ///
    /// The intended operation has domain equal to the list modality applied to its
    /// codomain, which usually signifies a product of some kind.
    pub fn collect_product(self, op_id: Option<QualifiedName>) -> Option<Vec<Self>> {
        match self {
            ModalOb::Generator(_) => Some(vec![self]),
            ModalOb::App(ob, other_id) if op_id.is_none_or(|id| id == other_id) => match *ob {
                ModalOb::List(_, objects) => Some(objects),
                _ => None,
            },
            _ => None,
        }
    }

    /// Recursively flatten a nested list of objects of the given depth.
    fn flatten_list(self, list_type: List, depth: usize) -> Result<Vec<Self>, String> {
        if depth == 0 {
            Ok(vec![self])
        } else if let ModalOb::List(other_type, vec) = self
            && other_type == list_type
        {
            if depth == 1 {
                Ok(vec)
            } else {
                let maybe_vec: Result<Vec<_>, _> =
                    vec.into_iter().map(|ob| ob.flatten_list(list_type, depth - 1)).collect();
                Ok(maybe_vec?.into_iter().flatten().collect())
            }
        } else {
            Err(format!("Object should be a list of type {list_type:?}"))
        }
    }
}

impl ModalMor {
    /// Recursively flatten a nested list of morphisms of the given depth.
    fn flatten_list(self, depth: usize) -> Result<Vec<Self>, String> {
        if depth == 0 {
            Ok(vec![self])
        } else if let ModalMor::List(MorListData::Plain(), vec) = self {
            if depth == 1 {
                Ok(vec)
            } else {
                let maybe_vec: Result<Vec<_>, _> =
                    vec.into_iter().map(|mor| mor.flatten_list(depth - 1)).collect();
                Ok(maybe_vec?.into_iter().flatten().collect())
            }
        } else {
            Err(format!("Morphism should be a list of type {:?}", List::Plain))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dbl::theory::DblTheory;
    use crate::stdlib::theories::*;
    use crate::zero::name;
    use crate::{dbl::tree::DblNode, one::tree::OpenTree};

    #[test]
    fn monoidal_category() {
        let th = Rc::new(th_monoidal_category());
        let ob_type = ModeApp::new(name("Object"));

        // Lists of objects.
        let mut model = ModalDblModel::new(th.clone());
        model.add_ob(name("x"), ob_type.clone());
        model.add_ob(name("y"), ob_type.clone());
        let [w, x, y, z] = [name("w"), name("x"), name("y"), name("z")].map(ModalOb::from);
        assert!(model.has_ob(&x));
        let pair = ModalOb::List(List::Plain, vec![x.clone(), y.clone()]);
        assert!(model.has_ob(&pair));
        assert!(!model.has_ob(&ModalOb::List(List::Plain, vec![x.clone(), z.clone()])));

        // Nested lists of objects.
        model.add_ob(name("w"), ob_type.clone());
        model.add_ob(name("z"), ob_type.clone());
        let pairs = ModalOb::List(
            List::Plain,
            vec![
                ModalOb::List(List::Plain, vec![w.clone(), x.clone()]),
                ModalOb::List(List::Plain, vec![y.clone(), z.clone()]),
            ],
        );
        assert!(model.has_ob(&pairs));
        assert_eq!(
            model.ob_act(pairs, &ModalObOp::concat(List::Plain, 2, ob_type.clone())),
            ModalOb::List(List::Plain, vec![w.clone(), x.clone(), y.clone(), z.clone()])
        );
        assert_eq!(
            model.ob_act(x.clone(), &ModalObOp::concat(List::Plain, 0, ob_type.clone())),
            ModalOb::List(List::Plain, vec![x.clone()])
        );

        // Products of objects.
        assert_eq!(model.ob_type(&pair), ob_type.clone().apply(List::Plain.into()));
        let mul_op = ModalObOp::generator(name("tensor"));
        let prod = model.ob_act(pair, &mul_op);
        assert!(model.has_ob(&prod));
        assert_eq!(model.ob_type(&prod), ob_type);

        // Model validation.
        model.add_mor(name("f"), x.clone(), y.clone(), th.hom_type(ob_type.clone()));
        model.add_mor(name("g"), w.clone(), z.clone(), th.hom_type(ob_type.clone()));
        let [f, g] = [name("f"), name("g")].map(ModalMor::from);
        assert!(model.has_mor(&f));
        assert!(model.validate().is_ok());

        // Lists of morphisms.
        let pair = ModalMor::List(MorListData::Plain(), vec![f.clone(), g.clone()]);
        assert!(model.has_mor(&pair));
        assert_eq!(model.mor_type(&pair), th.hom_type(ob_type.clone().apply(List::Plain.into())));
        let dom_list = ModalOb::List(List::Plain, vec![x.clone(), w.clone()]);
        let cod_list = ModalOb::List(List::Plain, vec![y.clone(), z.clone()]);
        assert_eq!(model.dom(&pair), dom_list);
        assert_eq!(model.cod(&pair), cod_list);

        // Products of morphisms.
        let ob_op = ModeApp::new(name("tensor").into());
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
        let ob_type = ModeApp::new(name("Object"));

        // Model validation.
        let mut model = ModalDblModel::new(th.clone());
        for id in [name("w"), name("x"), name("y"), name("z")] {
            model.add_ob(id, ob_type.clone());
        }
        let [w, x, y, z] = [name("w"), name("x"), name("y"), name("z")].map(ModalOb::from);
        model.add_mor(name("f"), x.clone(), y.clone(), th.hom_type(ob_type.clone()));
        model.add_mor(name("g"), w.clone(), z.clone(), th.hom_type(ob_type.clone()));
        let [f, g] = [name("f"), name("g")].map(ModalMor::from);
        assert!(model.validate().is_ok());

        // Lists of morphisms, with permutation.
        let pair = ModalMor::List(
            MorListData::Symmetric(SkelColumn::new(vec![1, 0])),
            vec![f.clone(), g.clone()],
        );
        assert!(model.has_mor(&pair));
        assert_eq!(model.dom(&pair), ModalOb::List(List::Symmetric, vec![x.clone(), w.clone()]));
        assert_eq!(model.cod(&pair), ModalOb::List(List::Symmetric, vec![z.clone(), y.clone()]));
        // Bad permutation.
        let pair = ModalMor::List(MorListData::Symmetric(SkelColumn::new(vec![0, 0])), vec![f, g]);
        assert!(!model.has_mor(&pair));
    }

    #[test]
    fn multicategory() {
        let th = Rc::new(th_multicategory());
        let ob_type = ModeApp::new(name("Object"));
        let mor_type: ModalMorType = ModeApp::new(name("Multihom")).into();

        // Model validation.
        let mut model = ModalDblModel::new(th.clone());
        model.add_ob(name("x"), ob_type.clone());
        let x: ModalOb = name("x").into();
        model.add_mor(
            name("binary"),
            ModalOb::List(List::Plain, vec![x.clone(), x.clone()]),
            x.clone(),
            mor_type.clone(),
        );
        model.add_mor(name("nullary"), ModalOb::List(List::Plain, vec![]), x.clone(), mor_type);
        assert!(model.validate().is_ok());
    }
}
