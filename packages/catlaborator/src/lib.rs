use egg::{define_language, EGraph, Id};
use ustr::Ustr;
use uuid::Uuid;
use std::rc::Rc;
use std::cell::RefCell;

#[derive(Clone, Copy)]
pub struct Field {
    pub lvl: usize,
    pub name: Option<Ustr>
}

#[derive(Clone, Copy)]
pub struct Lvl {
    pub lvl: usize,
    pub name: Option<Ustr>
}

pub struct NotebookRef {
    pub id: Uuid
}

#[derive(Clone)]
pub enum Value {
    Object(Id),
    Morphism(Id),
    Notebook(Rc<Vec<Value>>)
}

impl Value {
    fn as_object(&self) -> Id {
        match self {
            Value::Object(i) => *i,
            _ => panic!("expected object")
        }
    }

    fn as_morphism(&self) -> Id {
        match self {
            Value::Morphism(i) => *i,
            _ => panic!("expected morphism")
        }
    }

    fn proj(&self, field: Field) -> Value {
        match self {
            Value::Notebook(fields) => fields[field.lvl].clone(),
            _ => panic!("expected notebook")
        }
    }
}

pub enum TmStx {
    Var(Lvl),
    Proj(Rc<TmStx>, Field),
    Identity(Rc<TmStx>),
    Compose(Rc<TmStx>, Rc<TmStx>)
}

pub enum TyStx {
    Object(Ustr),
    Morphism(Ustr, TmStx, TmStx),
    Notebook(NotebookRef),
    Equality(TmStx, TmStx)
}

pub struct Notebook {
    pub cells: Vec<Cell>
}

pub struct Cell {
    pub name: Field,
    pub ty: TyStx
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
    object_generators: Vec<Ustr>,
    morphism_generators: Vec<(Id, Id, Ustr)>,
    egraph: EGraph<CatLang, ()>,
}

struct Context {
    neutrals: Rc<RefCell<Neutrals>>,
    values: Vec<Value>
}

impl Context {
    fn eval(&self, tm: &TmStx) -> Value {
        match tm {
            TmStx::Var(lvl) => self.values[lvl.lvl].clone(),
            TmStx::Proj(tm_stx, field) => self.eval(tm_stx).proj(*field),
            TmStx::Identity(tm_stx) => {
                let i = self.eval(tm_stx).as_object();
                Value::Morphism(self.neutrals.borrow_mut().egraph.add(CatLang::Identity([i])))
            },
            TmStx::Compose(f_stx, g_stx) => {
                let f = self.eval(f_stx).as_morphism();
                let g = self.eval(g_stx).as_morphism();
                Value::Morphism(self.neutrals.borrow_mut().egraph.add(CatLang::Compose([f, g])))
            },
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        let j = 1 + 2;
        assert_eq!(3, j);
        assert_eq!(4, j);
    }
}
