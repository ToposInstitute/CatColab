use egg::*;
use std::cell::{Ref, RefCell};
use std::collections::HashMap;
use std::rc::Rc;
use ustr::Ustr;

use crate::syntax::*;

#[derive(Clone, Debug)]
pub enum TmVal {
    Object(Id),
    Morphism(Id),
    Cells(Rc<Vec<TmVal>>),
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

    pub fn as_cells(&self) -> Rc<Vec<TmVal>> {
        match self {
            TmVal::Cells(cells) => cells.clone(),
            _ => panic!("expected cells"),
        }
    }

    pub fn proj(&self, field: Field) -> TmVal {
        match self {
            TmVal::Cells(fields) => fields[field.lvl].clone(),
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
    enum CatLang {
        Num(u32),
        "object" = Object([Id; 1]),
        "morphism" = Morphism([Id; 1]),
        "id" = Identity([Id; 1]),
        "compose" = Compose([Id; 2]),
    }
}

struct Neutrals {
    object_generators: Vec<ObType>,
    morphism_generators: Vec<(Id, Id, MorType)>,
    egraph: EGraph<CatLang, ()>,
}

impl Neutrals {
    fn new() -> Self {
        Neutrals {
            object_generators: Vec::new(),
            morphism_generators: Vec::new(),
            egraph: EGraph::new(()),
        }
    }

    fn add_object(&mut self, ty: ObType) -> Id {
        let i = self.object_generators.len();
        self.object_generators.push(ty);
        let i = self.egraph.add(CatLang::Num(i as u32));
        self.egraph.add(CatLang::Object([i]))
    }

    fn add_morphism(&mut self, dom: Id, cod: Id, ty: MorType) -> Id {
        let i = self.morphism_generators.len();
        self.morphism_generators.push((dom, cod, ty));
        let i = self.egraph.add(CatLang::Num(i as u32));
        self.egraph.add(CatLang::Morphism([i]))
    }
}

#[derive(Clone)]
pub struct State {
    neutrals: Rc<RefCell<Neutrals>>,
    notebooks: Rc<RefCell<HashMap<NotebookRef, Notebook>>>,
}

impl State {
    pub fn empty() -> State {
        State {
            neutrals: Rc::new(RefCell::new(Neutrals::new())),
            notebooks: Rc::new(RefCell::new(HashMap::new())),
        }
    }

    pub fn insert_notebook<T: Into<Ustr>>(&mut self, id: T, nb: Notebook) {
        self.notebooks.borrow_mut().insert(NotebookRef { id: id.into() }, nb);
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

    pub fn get_notebook(&self, nbref: &NotebookRef) -> Option<Ref<Notebook>> {
        Ref::filter_map(self.state.notebooks.borrow(), |m| m.get(nbref)).ok()
    }

    pub fn with_values(&self, values: &[TmVal]) -> Env {
        Env {
            state: self.state.clone(),
            values: values.into(),
        }
    }

    pub fn lookup_notebook(&self, id: Ustr) -> Option<NotebookRef> {
        let nr = NotebookRef { id };
        if self.state.notebooks.borrow().contains_key(&nr) {
            Some(nr)
        } else {
            None
        }
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
        }
    }

    pub fn intro(&mut self, ty: &TyVal) -> TmVal {
        match ty {
            TyVal::Object(ob_type) => {
                TmVal::Object(self.state.neutrals.borrow_mut().add_object(*ob_type))
            }
            TyVal::Morphism(mor_type, dom, cod) => TmVal::Morphism(
                self.state.neutrals.borrow_mut().add_morphism(*dom, *cod, *mor_type),
            ),
            TyVal::Notebook(notebook_ref) => {
                let notebooks = self.state.notebooks.borrow();
                let notebook = notebooks.get(notebook_ref).unwrap();
                self.state.new_env().intro_notebook(notebook)
            }
            TyVal::Equality(v1, v2) => {
                self.equate(&v1, &v2);
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
            (TmVal::Cells(cells1), TmVal::Cells(cells2)) => {
                for (c1, c2) in cells1.iter().zip(cells2.iter()) {
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
            TyStx::Morphism(mor_type, d, c) => {
                TyVal::Morphism(*mor_type, self.eval(d).as_object(), self.eval(c).as_object())
            }
            TyStx::Notebook(notebook_ref) => TyVal::Notebook(*notebook_ref),
            TyStx::Equality(lhs, rhs) => TyVal::Equality(self.eval(lhs), self.eval(rhs)),
        }
    }

    pub fn intro_cell(&mut self, cell: &Cell) -> TmVal {
        self.intro(&self.eval_ty(&cell.ty))
    }

    pub fn intro_notebook(mut self, nb: &Notebook) -> TmVal {
        for cell_stx in nb.cells.iter() {
            let val = self.intro_cell(&cell_stx);
            self.values.push(val);
        }
        TmVal::Cells(Rc::new(self.values))
    }

    fn find(&self, id: Id) -> Id {
        self.state.neutrals.borrow().egraph.find(id)
    }

    pub fn equal(&self, id1: Id, id2: Id) -> bool {
        self.find(id1) == self.find(id2)
    }

    pub fn convertable_tys(&self, ty1: &TyVal, ty2: &TyVal) -> bool {
        use TyVal::*;
        match (ty1, ty2) {
            (Object(ot1), Object(ot2)) => ot1 == ot2,
            (Morphism(mt1, d1, c1), Morphism(mt2, d2, c2)) => {
                mt1 == mt2 && self.equal(*d1, *d2) && self.equal(*c1, *c2)
            }
            (Notebook(nr1), Notebook(nr2)) => nr1 == nr2,
            (Equality(_, _), Equality(_, _)) => true,
            _ => false,
        }
    }
}
