use catlog::one::Path;
use pretty::RcDoc;
use pretty_util::{binop, braces, parens};
use std::{fmt, rc::Rc};
use ustr::{Ustr, ustr};

/// An identifier with a forward-counting index (0 is the first thing in the scope)
#[derive(Clone, Copy, Debug)]
pub struct FwdIdent {
    pub index: usize,
    pub name: Ustr,
}

impl FwdIdent {
    pub fn new(index: usize, name: Option<Ustr>) -> Self {
        Self {
            index,
            name: name.unwrap_or(ustr("_")),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct ClassIdent {
    pub id: Ustr, // should be Uuid once we're doing real notebooks
}

#[derive(Debug)]
pub enum TmStx {
    // We don't need to use deBruijn indices here because we don't have lambdas
    Var(FwdIdent),
    Proj(Rc<TmStx>, FwdIdent),
    Identity(Rc<TmStx>),
    Compose(Rc<TmStx>, Rc<TmStx>),
    New(Rc<Vec<(Ustr, TmStx)>>),
    Refl,
}

impl TmStx {
    fn pprint(&self) -> RcDoc {
        match self {
            TmStx::Var(lvl) => RcDoc::text(lvl.name.as_str()),
            TmStx::Proj(tm, field) => {
                tm.pprint().append(RcDoc::text(".")).append(RcDoc::text(field.name.as_str()))
            }
            TmStx::Identity(tm) => RcDoc::text("@id").append(RcDoc::space()).append(tm.pprint()),
            TmStx::Compose(tm1, tm2) => {
                tm1.pprint().append(RcDoc::text(" * ")).append(tm2.pprint())
            }
            TmStx::New(items) => braces(RcDoc::concat(items.iter().map(|(name, tm)| {
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
    InstanceOf(ClassIdent),
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
            TyStx::InstanceOf(notebook_ref) => RcDoc::text("@Notebook")
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
pub struct ClassStx {
    pub members: Vec<MemberStx>,
}

impl ClassStx {
    pub fn new(members: Vec<MemberStx>) -> Self {
        Self { members }
    }
}

#[derive(Debug)]
pub struct MemberStx {
    pub name: Ustr,
    pub ty: TyStx,
}

impl MemberStx {
    pub fn new(name: Ustr, ty: TyStx) -> Self {
        Self { name, ty }
    }
}
