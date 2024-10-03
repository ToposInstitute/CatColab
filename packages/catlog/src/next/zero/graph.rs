use super::set::FinSet;
use super::set::*;

pub trait Graph {
    type V;
    type Vertices: Set<Elem = Self::V>;

    type E;
    type Edges: Set<Elem = Self::E>;

    type Src: Mapping<Dom = Self::E, Cod = Self::V>;
    type Tgt: Mapping<Dom = Self::E, Cod = Self::V>;

    fn vertices(&self) -> &Self::Vertices;

    fn edges(&self) -> &Self::Edges;

    fn src(&self) -> &Self::Src;

    fn tgt(&self) -> &Self::Tgt;
}

pub trait FinGraph:
    Graph<Vertices: FinSet, Edges: FinSet, Src: FinMapping, Tgt: FinMapping>
{
}

struct SkelFinGraph {
    vertices: SkelFinSet,
    edges: SkelFinSet,
    src: SkelColumn,
    tgt: SkelColumn,
}

impl Graph for SkelFinGraph {
    type V = usize;
    type Vertices = SkelFinSet;

    type E = usize;
    type Edges = SkelFinSet;

    type Src = SkelColumn;
    type Tgt = SkelColumn;

    fn vertices(&self) -> &Self::Vertices {
        &self.vertices
    }

    fn edges(&self) -> &Self::Edges {
        &self.edges
    }

    fn src(&self) -> &Self::Src {
        &self.src
    }

    fn tgt(&self) -> &Self::Tgt {
        &self.tgt
    }
}

impl FinGraph for SkelFinGraph {}

fn incoming_edges<G: FinGraph>(g: &G, v: &G::V) -> Vec<G::E> {
    g.tgt().fiber(v).collect()
}
