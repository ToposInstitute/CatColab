use std::fmt;

use crate::tt::{prelude::*, stx::*, val::*};

pub enum TopDecl {
    Type(TyS, TyV),
    Term(TmS, TmV, TyV),
}

impl TopDecl {
    pub fn as_ty(&self) -> TyV {
        match self {
            TopDecl::Type(_, ty) => ty.clone(),
            _ => panic!("expected type"),
        }
    }

    pub fn as_tm(&self) -> TmV {
        match self {
            TopDecl::Term(_, tm, _) => tm.clone(),
            _ => panic!("expected type"),
        }
    }
}

impl fmt::Display for TopDecl {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TopDecl::Type(ty_s, _) => write!(f, "{}", ty_s),
            TopDecl::Term(tm_s, _, _) => write!(f, "{}", tm_s),
        }
    }
}

pub struct Toplevel {
    pub definitions: HashMap<TopVarName, TopDecl>,
}

impl Toplevel {
    pub fn new() -> Self {
        Self {
            definitions: HashMap::new(),
        }
    }

    pub fn lookup(&self, name: TopVarName) -> Option<&TopDecl> {
        self.definitions.get(&name)
    }
}
