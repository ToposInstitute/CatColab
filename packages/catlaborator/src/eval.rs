use egg::*;
use std::cell::RefCell;
use std::rc::Rc;
use ustr::Ustr;

use crate::elab::Schema;
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
    Object(Id),
    Morphism(Id),
    Cells(Rc<Vec<(Ustr, TmVal)>>, GeneratorRange),
    Erased,
}

impl TmVal {
    pub fn as_object(&self) -> Id {
        match self {
            TmVal::Object(i) => *i,
            _ => panic!("expected object"),
        }
    }

    pub fn as_morphism(&self) -> Id {
        match self {
            TmVal::Morphism(i) => *i,
            _ => panic!("expected morphism"),
        }
    }

    pub fn as_cells(&self) -> Rc<Vec<(Ustr, TmVal)>> {
        match self {
            TmVal::Cells(cells, _) => cells.clone(),
            _ => panic!("expected cells"),
        }
    }

    pub fn proj(&self, field: Field) -> TmVal {
        match self {
            TmVal::Cells(fields, _) => fields[field.lvl].1.clone(),
            _ => panic!("expected notebook"),
        }
    }
}

#[derive(Clone, Debug)]
pub enum TyVal {
    Object(ObType),
    Morphism(MorType, Id, Id),
    Notebook(NotebookRef),
    Equality(TmVal, TmVal),
}

define_language! {
    pub enum CatLang {
        Num(u32),
        "id" = Identity([Id; 1]),
        "compose" = Compose([Id; 2]),
    }
}

#[allow(dead_code)]
enum GeneratorType {
    Object(ObType),
    Morphism(Id, Id, MorType),
}

struct Neutrals {
    generators: Vec<(GeneratorType, Id)>,
    egraph: EGraph<CatLang, ()>,
}

impl Neutrals {
    fn new() -> Self {
        Neutrals {
            generators: Vec::new(),
            egraph: EGraph::new(()),
        }
    }

    fn add_object(&mut self, ty: ObType) -> Id {
        let i = self.generators.len();
        let id = self.egraph.add(CatLang::Num(i as u32));
        self.generators.push((GeneratorType::Object(ty), id));
        id
    }

    fn add_morphism(&mut self, dom: Id, cod: Id, ty: MorType) -> Id {
        let i = self.generators.len();
        let id = self.egraph.add(CatLang::Num(i as u32));
        self.generators.push((GeneratorType::Morphism(dom, cod, ty), id));
        id
    }
}

#[derive(Clone)]
pub struct State {
    neutrals: Rc<RefCell<Neutrals>>,
    notebooks: Rc<dyn NotebookStorage>,
}

impl State {
    pub fn empty(notebooks: Rc<dyn NotebookStorage>) -> State {
        State {
            neutrals: Rc::new(RefCell::new(Neutrals::new())),
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

    pub fn id_for_generator(&self, generator: usize) -> Id {
        self.find(self.state.neutrals.borrow().generators[generator].1)
    }

    pub fn identity(&self, id: Id) -> TmVal {
        TmVal::Morphism(self.state.neutrals.borrow_mut().egraph.add(CatLang::Identity([id])))
    }

    pub fn compose(&self, id1: Id, id2: Id) -> TmVal {
        TmVal::Morphism(self.state.neutrals.borrow_mut().egraph.add(CatLang::Compose([id1, id2])))
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
                let f = self.eval(f_stx).as_morphism();
                let g = self.eval(g_stx).as_morphism();
                self.compose(f, g)
            }
            TmStx::MkNotebook(items) => TmVal::Cells(
                Rc::new(items.iter().map(|(name, tm)| (*name, self.eval(tm))).collect()),
                GeneratorRange { start: 0, end: 0 },
            ),
            TmStx::Refl => TmVal::Erased,
        }
    }

    pub fn intro(&mut self, ty: &TyVal) -> TmVal {
        match ty {
            TyVal::Object(ob_type) => {
                TmVal::Object(self.state.neutrals.borrow_mut().add_object(*ob_type))
            }
            TyVal::Morphism(mor_type, dom, cod) => TmVal::Morphism(
                self.state.neutrals.borrow_mut().add_morphism(*dom, *cod, mor_type.clone()),
            ),
            TyVal::Notebook(notebook_ref) => {
                let notebook = self.state.notebooks.get(*notebook_ref);
                self.state.new_env().intro_notebook(&*notebook)
            }
            TyVal::Equality(v1, v2) => {
                self.equate(v1, v2);
                TmVal::Erased
            }
        }
    }

    pub fn equate(&self, v1: &TmVal, v2: &TmVal) {
        match (v1, v2) {
            (TmVal::Object(i1), TmVal::Object(i2)) => {
                self.state.neutrals.borrow_mut().egraph.union(*i1, *i2);
            }
            (TmVal::Morphism(i1), TmVal::Morphism(i2)) => {
                self.state.neutrals.borrow_mut().egraph.union(*i1, *i2);
            }
            (TmVal::Cells(cells1, _), TmVal::Cells(cells2, _)) => {
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

    pub fn intro_cell(&mut self, cell: &Cell) -> TmVal {
        self.intro(&self.eval_ty(&cell.ty))
    }

    pub fn intro_notebook(mut self, nb: &Notebook) -> TmVal {
        let start = self.state.neutrals.borrow().generators.len();
        for cell_stx in nb.cells.iter() {
            let val = self.intro_cell(cell_stx);
            self.values.push(val);
        }
        let end = self.state.neutrals.borrow().generators.len();
        TmVal::Cells(
            Rc::new(nb.cells.iter().map(|c| c.name).zip(self.values.into_iter()).collect()),
            GeneratorRange { start, end },
        )
    }

    pub fn find(&self, id: Id) -> Id {
        self.state.neutrals.borrow().egraph.find(id)
    }

    pub fn extract(&self, id: Id) -> RecExpr<CatLang> {
        self.state.neutrals.borrow().egraph.id_to_expr(id)
    }

    pub fn equal(&self, id1: Id, id2: Id) -> bool {
        self.find(id1) == self.find(id2)
    }

    pub fn convertable_tys(&self, _schema: &Schema, ty1: &TyVal, ty2: &TyVal) -> bool {
        use TyVal::*;
        match (ty1, ty2) {
            (Object(ot1), Object(ot2)) => ot1 == ot2,
            (Morphism(mt1, d1, c1), Morphism(mt2, d2, c2)) => {
                // TODO: this seems to break WASM compatibility
                // schema.category().morphisms_are_equal(mt1.clone(), mt2.clone())
                mt1 == mt2 && self.equal(*d1, *d2) && self.equal(*c1, *c2)
            }
            (Notebook(nr1), Notebook(nr2)) => nr1 == nr2,
            (Equality(_, _), Equality(_, _)) => true,
            _ => false,
        }
    }
}
