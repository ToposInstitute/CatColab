use catlog::one::Path;
use pretty::RcDoc;
use pretty_util::{binop, braces, parens};
use std::{fmt, rc::Rc};
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

    pub fn name(&self) -> &'static str {
        self.name.map_or("", |n| n.as_str())
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

    pub fn name(&self) -> &'static str {
        self.name.map_or("", |n| n.as_str())
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
    MkNotebook(Rc<Vec<(Ustr, TmStx)>>),
    Refl,
}

impl TmStx {
    fn pprint(&self) -> RcDoc {
        match self {
            TmStx::Var(lvl) => RcDoc::text(lvl.name()),
            TmStx::Proj(tm, field) => {
                tm.pprint().append(RcDoc::text(".")).append(RcDoc::text(field.name()))
            }
            TmStx::Identity(tm) => RcDoc::text("@id").append(RcDoc::space()).append(tm.pprint()),
            TmStx::Compose(tm1, tm2) => {
                tm1.pprint().append(RcDoc::text(" * ")).append(tm2.pprint())
            }
            TmStx::MkNotebook(items) => braces(RcDoc::concat(items.iter().map(|(name, tm)| {
                binop(RcDoc::text(name.as_str()), "=", tm.pprint()).append(RcDoc::text(";"))
            }))),
            TmStx::Refl => RcDoc::text("@refl"),
        }
    }
}

impl fmt::Display for TmStx {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.pprint().render_fmt(80, f)
    }
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

fn pprint_path(p: &Path<Ustr, Ustr>) -> RcDoc {
    match p {
        Path::Id(ob) => {
            parens(RcDoc::text("@Id").append(RcDoc::space()).append(RcDoc::text(ob.as_str())))
        }
        Path::Seq(non_empty) => parens(RcDoc::intersperse(
            non_empty.iter().map(|mor| RcDoc::text(mor.as_str())),
            RcDoc::text(" * "),
        )),
    }
}

impl TyStx {
    fn pprint(&self) -> RcDoc {
        match self {
            TyStx::Object(ustr) => RcDoc::text("@Ob ").append(RcDoc::text(ustr.as_str())),
            TyStx::Morphism(path, dom, codom) => RcDoc::text("@Mor")
                .append(RcDoc::space())
                .append(pprint_path(path))
                .append(RcDoc::space())
                .append(dom.pprint())
                .append(RcDoc::space())
                .append(codom.pprint()),
            TyStx::Notebook(notebook_ref) => RcDoc::text("@Notebook")
                .append(RcDoc::space())
                .append(RcDoc::text(notebook_ref.id.as_str())),
            TyStx::Equality(lhs, rhs) => binop(lhs.pprint(), "==", rhs.pprint()),
        }
    }
}

impl fmt::Display for TyStx {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.pprint().render_fmt(80, f)
    }
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
