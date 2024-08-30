use derive_more::derive::From;
use ref_cast::RefCast;

use super::super::zero::{generated_set::*, graph::*, set::*};
use super::path::*;

pub trait Category {
    type Ob;
    type Objects: Set<Elem = Self::Ob>;

    type Mor;
    type Morphisms: Set<Elem = Self::Mor>;

    type Dom: Mapping<Dom = Self::Mor, Cod = Self::Ob>;
    type Cod: Mapping<Dom = Self::Mor, Cod = Self::Ob>;

    fn objects(&self) -> &Self::Objects;

    fn morphisms(&self) -> &Self::Morphisms;

    fn dom(&self) -> &Self::Dom;

    fn cod(&self) -> &Self::Cod;

    fn id(&self, x: &Self::Ob) -> Self::Mor;

    /// TODO: make n-ary
    fn compose(&self, f: &Self::Mor, g: &Self::Mor) -> Self::Mor;
}

pub trait FgCategory:
    Category<
    Objects: GeneratedSet,
    Morphisms: GeneratedSet,
    Dom: GeneratedMapping,
    Cod: GeneratedMapping,
>
{
}

pub struct FreeCategory<G: FinGraph>(G);

#[derive(RefCast, From)]
#[repr(transparent)]
pub struct PathsOf<G: FinGraph>(G);

impl<G: FinGraph> Set for PathsOf<G>
where
    G::V: Eq,
    G::E: Eq,
{
    type Elem = Path<G::V, G::E>;

    fn contains(&self, x: &Self::Elem) -> bool {
        x.contained_in(&self.0)
    }
}

impl<G: FinGraph> GeneratedSet for PathsOf<G>
where
    G::V: Eq,
    G::E: Eq + Clone,
{
    type Generator = G::E;
    type Generators = G::Edges;

    fn generators(&self) -> &Self::Generators {
        self.0.edges()
    }

    fn generate(&self, e: &Self::Generator) -> Self::Elem {
        Path::single(e.clone())
    }
}

#[derive(RefCast, From)]
#[repr(transparent)]
pub struct PathDom<G: FinGraph>(G);

impl<G: FinGraph> Mapping for PathDom<G>
where
    G::V: Clone,
{
    type Dom = Path<G::V, G::E>;
    type Cod = G::V;

    fn ap(&self, x: &Self::Dom) -> Self::Cod {
        x.src(&self.0)
    }
}

impl<G: FinGraph> GeneratedMapping for PathDom<G>
where
    G::V: Clone,
{
    type DomGenerator = G::E;

    fn apgen(&self, x: &Self::DomGenerator) -> Self::Cod {
        self.0.src().ap(x)
    }
}

#[derive(RefCast, From)]
#[repr(transparent)]
pub struct PathCod<G: FinGraph>(G);

impl<G: FinGraph> Mapping for PathCod<G>
where
    G::V: Clone,
{
    type Dom = Path<G::V, G::E>;
    type Cod = G::V;

    fn ap(&self, x: &Self::Dom) -> Self::Cod {
        x.src(&self.0)
    }
}

impl<G: FinGraph> GeneratedMapping for PathCod<G>
where
    G::V: Clone,
{
    type DomGenerator = G::E;

    fn apgen(&self, x: &Self::DomGenerator) -> Self::Cod {
        self.0.tgt().ap(x)
    }
}

impl<G: FinGraph> Category for FreeCategory<G>
where
    G::V: Eq + Clone,
    G::E: Eq + Clone,
{
    type Ob = G::V;
    type Objects = TautologicallyGenerated<G::Vertices>;

    type Mor = Path<G::V, G::E>;
    type Morphisms = PathsOf<G>;

    type Dom = PathDom<G>;
    type Cod = PathCod<G>;

    fn objects(&self) -> &Self::Objects {
        TautologicallyGenerated::ref_cast(self.0.vertices())
    }

    fn morphisms(&self) -> &Self::Morphisms {
        PathsOf::ref_cast(&self.0)
    }

    fn dom(&self) -> &Self::Dom {
        PathDom::ref_cast(&self.0)
    }

    fn cod(&self) -> &Self::Cod {
        PathCod::ref_cast(&self.0)
    }

    fn id(&self, x: &Self::Ob) -> Self::Mor {
        Path::empty(x.clone())
    }

    fn compose(&self, f: &Self::Mor, g: &Self::Mor) -> Self::Mor {
        Path::pair(f.clone(), g.clone()).flatten()
    }
}

impl<G: FinGraph> FgCategory for FreeCategory<G>
where
    G::V: Eq + Clone,
    G::E: Eq + Clone,
{
}
