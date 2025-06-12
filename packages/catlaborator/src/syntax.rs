use catlog::one::Path;
use std::rc::Rc;
use ustr::Ustr;

#[derive(Clone, Copy, Debug)]
pub struct Field {
    pub lvl: usize,
    pub name: Option<Ustr>,
}

impl Field {
    pub fn new(lvl: usize, name: Option<Ustr>) -> Self {
        Self { lvl, name }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Lvl {
    pub lvl: usize,
    pub name: Option<Ustr>,
}

impl Lvl {
    pub fn new(lvl: usize, name: Option<Ustr>) -> Self {
        Self { lvl, name }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct NotebookRef {
    pub id: Ustr, // should be Uuid once we're doing real notebooks
}

#[derive(Debug)]
pub enum TmStx {
    // We don't need to use deBruijn indices here because we don't have lambdas
    Var(Lvl),
    Proj(Rc<TmStx>, Field),
    Identity(Rc<TmStx>),
    Compose(Rc<TmStx>, Rc<TmStx>),
}

pub type ObType = Ustr;

pub type MorType = Path<Ustr, Ustr>;

#[derive(Debug)]
pub enum TyStx {
    Object(ObType),
    Morphism(MorType, TmStx, TmStx),
    Notebook(NotebookRef),
    Equality(TmStx, TmStx),
}

#[derive(Debug)]
pub struct Notebook {
    pub cells: Vec<Cell>,
}

impl Notebook {
    pub fn new(cells: Vec<Cell>) -> Self {
        Self { cells }
    }
}

#[derive(Debug)]
pub struct Cell {
    pub name: Ustr,
    pub ty: TyStx,
}

impl Cell {
    pub fn new(name: Ustr, ty: TyStx) -> Self {
        Self { name, ty }
    }
}
