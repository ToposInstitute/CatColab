use catlog::dbl::model::{DiscreteDblModel, MutDblModel};
use catlog::dbl::theory::UstrDiscreteDblTheory;
use catlog::one::{Category, Path, PathEq, UstrFpCategory};
use std::cell::RefCell;
use std::rc::Rc;
use ustr::Ustr;

use crate::name::{QualifiedName, Segment};
use crate::syntax::*;

pub trait NotebookStorage {
    fn lookup(&self, id: &str) -> Option<Rc<Notebook>>;

    fn get(&self, r: NotebookRef) -> Rc<Notebook> {
        self.lookup(r.id.as_str()).unwrap()
    }
}

#[derive(Copy, Clone, Debug)]
pub struct GeneratorRange {
    start: usize,
    end: usize,
}

impl GeneratorRange {
    pub fn contains(&self, i: usize) -> bool {
        self.start <= i && i < self.end
    }
}

#[derive(Clone, Debug)]
pub enum TmVal {
    Object(QualifiedName),
    Morphism(Path<QualifiedName, QualifiedName>),
    Cells(Rc<Vec<(Ustr, TmVal)>>),
    Erased,
}

impl TmVal {
    pub fn as_object(&self) -> QualifiedName {
        match self {
            TmVal::Object(n) => n.clone(),
            _ => panic!("expected object"),
        }
    }

    pub fn as_morphism(&self) -> &Path<QualifiedName, QualifiedName> {
        match self {
            TmVal::Morphism(p) => p,
            _ => panic!("expected morphism"),
        }
    }

    pub fn as_cells(&self) -> Rc<Vec<(Ustr, TmVal)>> {
        match self {
            TmVal::Cells(cells) => cells.clone(),
            _ => panic!("expected cells"),
        }
    }

    pub fn proj(&self, field: Field) -> TmVal {
        match self {
            TmVal::Cells(fields) => fields[field.lvl].1.clone(),
            _ => panic!("expected notebook"),
        }
    }
}

#[derive(Clone, Debug)]
pub enum TyVal {
    Object(ObType),
    Morphism(MorType, QualifiedName, QualifiedName),
    Notebook(NotebookRef),
    Equality(TmVal, TmVal),
}

#[derive(Clone)]
pub struct State {
    pub neutrals: Rc<RefCell<DiscreteDblModel<QualifiedName, UstrFpCategory>>>,
    notebooks: Rc<dyn NotebookStorage>,
}

impl State {
    pub fn empty(notebooks: Rc<dyn NotebookStorage>, theory: Rc<UstrDiscreteDblTheory>) -> State {
        State {
            neutrals: Rc::new(RefCell::new(DiscreteDblModel::new(theory))),
            notebooks,
        }
    }

    pub fn new_env(&self) -> Env {
        Env {
            state: self.clone(),
            values: Vec::new(),
        }
    }
}

pub struct Env {
    state: State,
    pub values: Vec<TmVal>,
}

impl Env {
    pub fn get(&self, i: Lvl) -> TmVal {
        self.values[i.lvl].clone()
    }

    pub fn get_notebook(&self, nbref: &NotebookRef) -> Option<Rc<Notebook>> {
        self.state.notebooks.lookup(nbref.id.as_str())
    }

    pub fn with_values(&self, values: &[(Ustr, TmVal)]) -> Self {
        Self {
            state: self.state.clone(),
            values: values.iter().map(|(_, v)| v.clone()).collect(),
        }
    }

    pub fn lookup_notebook(&self, id: Ustr) -> Option<NotebookRef> {
        if let Some(_) = self.state.notebooks.lookup(id.as_str()) {
            Some(NotebookRef { id })
        } else {
            None
        }
    }

    pub fn identity(&self, ob: QualifiedName) -> TmVal {
        TmVal::Morphism(self.state.neutrals.borrow().compose(Path::empty(ob)))
    }

    pub fn compose(
        &self,
        f: Path<QualifiedName, QualifiedName>,
        g: Path<QualifiedName, QualifiedName>,
    ) -> TmVal {
        TmVal::Morphism(self.state.neutrals.borrow().compose2(f, g))
    }

    pub fn eval(&self, tm: &TmStx) -> TmVal {
        match tm {
            TmStx::Var(lvl) => self.get(*lvl),
            TmStx::Proj(tm_stx, field) => self.eval(tm_stx).proj(*field),
            TmStx::Identity(tm_stx) => {
                let i = self.eval(tm_stx).as_object();
                self.identity(i)
            }
            TmStx::Compose(f_stx, g_stx) => {
                let f = self.eval(f_stx).as_morphism().clone();
                let g = self.eval(g_stx).as_morphism().clone();
                self.compose(f, g)
            }
            TmStx::MkNotebook(items) => TmVal::Cells(Rc::new(
                items.iter().map(|(name, tm)| (*name, self.eval(tm))).collect(),
            )),
            TmStx::Refl => TmVal::Erased,
        }
    }

    pub fn intro(&mut self, at: QualifiedName, ty: &TyVal) -> TmVal {
        match ty {
            TyVal::Object(ob_type) => {
                self.state.neutrals.borrow_mut().add_ob(at.clone(), *ob_type);
                TmVal::Object(at)
            }
            TyVal::Morphism(mor_type, dom, cod) => {
                self.state.neutrals.borrow_mut().add_mor(
                    at.clone(),
                    dom.clone(),
                    cod.clone(),
                    mor_type.clone(),
                );
                TmVal::Morphism(Path::single(at))
            }
            TyVal::Notebook(notebook_ref) => {
                let notebook = self.state.notebooks.get(*notebook_ref);
                self.state.new_env().intro_notebook(&at, &*notebook)
            }
            TyVal::Equality(v1, v2) => {
                self.equate(v1, v2);
                TmVal::Erased
            }
        }
    }

    pub fn equate(&self, v1: &TmVal, v2: &TmVal) {
        match (v1, v2) {
            (TmVal::Object(n1), TmVal::Object(n2)) => {
                self.state.neutrals.borrow_mut().add_ob_equation(n1.clone(), n2.clone());
            }
            (TmVal::Morphism(f1), TmVal::Morphism(f2)) => {
                self.state
                    .neutrals
                    .borrow_mut()
                    .add_equation(PathEq::new(f1.clone(), f2.clone()));
            }
            (TmVal::Cells(cells1), TmVal::Cells(cells2)) => {
                for ((_, c1), (_, c2)) in cells1.iter().zip(cells2.iter()) {
                    self.equate(c1, c2)
                }
            }
            (TmVal::Erased, TmVal::Erased) => {}
            _ => panic!("tried to equate two values of different types"),
        }
    }

    pub fn eval_ty(&self, ty: &TyStx) -> TyVal {
        match ty {
            TyStx::Object(ob_type) => TyVal::Object(*ob_type),
            TyStx::Morphism(mor_type, d, c) => TyVal::Morphism(
                mor_type.clone(),
                self.eval(d).as_object(),
                self.eval(c).as_object(),
            ),
            TyStx::Notebook(notebook_ref) => TyVal::Notebook(*notebook_ref),
            TyStx::Equality(lhs, rhs) => TyVal::Equality(self.eval(lhs), self.eval(rhs)),
        }
    }

    pub fn intro_cell(&mut self, qualification: &QualifiedName, i: usize, cell: &Cell) -> TmVal {
        self.intro(
            qualification.extend(Segment::new(i).with_name(cell.name)),
            &self.eval_ty(&cell.ty),
        )
    }

    pub fn intro_notebook(mut self, qualification: &QualifiedName, nb: &Notebook) -> TmVal {
        for (i, cell_stx) in nb.cells.iter().enumerate() {
            let val = self.intro_cell(qualification, i, cell_stx);
            self.values.push(val);
        }
        TmVal::Cells(Rc::new(
            nb.cells.iter().map(|c| c.name).zip(self.values.into_iter()).collect(),
        ))
    }

    pub fn objects_are_equal(&self, n1: QualifiedName, n2: QualifiedName) -> bool {
        self.state.neutrals.borrow().objects_are_equal(n1, n2)
    }

    pub fn convertable_tys(
        &self,
        theory: &UstrDiscreteDblTheory,
        ty1: &TyVal,
        ty2: &TyVal,
    ) -> bool {
        use TyVal::*;
        match (ty1, ty2) {
            (Object(ot1), Object(ot2)) => ot1 == ot2,
            (Morphism(mt1, d1, c1), Morphism(mt2, d2, c2)) => {
                // TODO: this seems to break WASM compatibility
                // schema.category().morphisms_are_equal(mt1.clone(), mt2.clone())
                theory.category().morphisms_are_equal(mt1.clone(), mt2.clone())
                    && self.objects_are_equal(d1.clone(), d2.clone())
                    && self.objects_are_equal(c1.clone(), c2.clone())
            }
            (Notebook(nr1), Notebook(nr2)) => nr1 == nr2,
            (Equality(_, _), Equality(_, _)) => true,
            _ => false,
        }
    }
}
