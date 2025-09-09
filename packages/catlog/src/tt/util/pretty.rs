use pretty::RcDoc;
use std::{borrow::Cow, fmt, ops};

#[derive(Clone)]
pub struct D<'a>(RcDoc<'a, ()>);

impl<'a> ops::Add for D<'a> {
    type Output = D<'a>;

    fn add(self, rhs: Self) -> Self::Output {
        D(self.0.append(rhs.0))
    }
}

pub fn t<'a, U: Into<Cow<'a, str>>>(data: U) -> D<'a> {
    D(RcDoc::text(data))
}

pub fn s<'a>() -> D<'a> {
    D(RcDoc::line())
}

pub fn binop<'a>(op: &'a str, l: D<'a>, r: D<'a>) -> D<'a> {
    (l + s() + t(op) + s() + r).parens()
}

pub fn tuple<'a, I: IntoIterator<Item = D<'a>>>(i: I) -> D<'a> {
    D(RcDoc::intersperse(i.into_iter().map(|d| d.0), (t(",") + s()).0))
}

impl<'a> D<'a> {
    pub fn group(self) -> D<'a> {
        D(self.0.group())
    }

    pub fn parens(self) -> D<'a> {
        t("(") + self.group() + t(")")
    }

    pub fn brackets(self) -> D<'a> {
        t("[") + self.group() + t("]")
    }

    pub fn pretty(&self) -> impl fmt::Display {
        self.0.pretty(80)
    }
}

pub trait ToDoc {
    fn to_doc<'a>(&'a self) -> D<'a>;
}
