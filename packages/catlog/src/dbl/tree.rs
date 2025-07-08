/*! Double trees: pasting diagrams in virtual double categories.

A *double tree* (nonstandard term) is the data structure for a [pasting
diagram](https://ncatlab.org/nlab/show/pasting+diagram) in a virtual double
category. To be more precise, a double tree is ([up to
isomorphism](DblTree::is_isomorphic_to)) a normal form for a general composition
of cells in a VDC. That is, every sequence of composing cells and forming
identity cells can be represented as a double tree, and, moreover, any two
sequences equivalent under the associativity and unitality axioms of a VDC are
represented by the same double tree.

Yet another way to say this is that double trees are the cells of [free
VDCs](super::category::FreeVDblCategory), generalizing how trees are the
morphisms of free multicategories. Turning this around, we use our data
structure for trees, specifically [open trees](crate::one::tree), to implement
double trees, the idea being that a double tree is an open tree whose types are
proarrows and operations are cells, subject to additional typing constraints on
the sources and targets.

The only hitch in this plan is that composition in a VDC includes the degenerate
case of composing a cell with a zero-length path of cells, which is just a
single arrow. To accomodate the degenerate case, the [nodes](DblNode) in a
double tree contain either cells *or* arrows. This complicates the code in a few
places, since it is now possible for a nullary operation (cell) to have a child
node, and it gives the data structure something of the spirit of *augmented*
virtual double categories ([Koudenburg 2020](crate::refs::AugmentedVDCs)). We do
not however implement pasting diagrams in augmented VDCs, which would introduce
further complications.
 */

use derive_more::From;
use ego_tree::NodeRef;
use itertools::{EitherOrBoth::Both, Itertools, zip_eq};

use super::graph::VDblGraph;
use crate::one::{path::Path, tree::*, tree_algorithms::*};

/** A node in a [double tree](DblTree).

More precisely, this is the type of *values* carried by nodes in a double tree.
 */
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DblNode<E, Sq> {
    /// A generic cell, given by a square in a virtual double graph.
    Cell(Sq),

    /** An edge on the boundary of the double tree.

    In a well-formed double tree, each spine node must be a child of a nullary
    cell or of another spine node. Spines represent the operation of
    precomposing a nullary cell with an arrow to obtain another nullary cell, a
    degenerate case of composition in a virtual double category.
     */
    Spine(E),
}

impl<E, Sq> DblNode<E, Sq> {
    /** Domain of node in the given virtual double graph.

    Returns a path of arbitrary length.
     */
    pub fn dom<V, ProE>(
        &self,
        graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>,
    ) -> Path<V, ProE> {
        match self {
            DblNode::Cell(sq) => graph.square_dom(sq),
            DblNode::Spine(e) => Path::empty(graph.dom(e)),
        }
    }

    /** Codomain of node in the given virtual double graph.

    Returns a path of length at most one.
     */
    pub fn cod<V, ProE>(
        &self,
        graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>,
    ) -> Path<V, ProE> {
        match self {
            DblNode::Cell(sq) => graph.square_cod(sq).into(),
            DblNode::Spine(e) => Path::empty(graph.cod(e)),
        }
    }

    /// Source of node in the given virtual double graph.
    pub fn src(&self, graph: &impl VDblGraph<E = E, Sq = Sq>) -> E
    where
        E: Clone,
    {
        match self {
            DblNode::Cell(sq) => graph.square_src(sq),
            DblNode::Spine(e) => e.clone(),
        }
    }

    /// Target of node in the given virtual double graph.
    pub fn tgt(&self, graph: &impl VDblGraph<E = E, Sq = Sq>) -> E
    where
        E: Clone,
    {
        match self {
            DblNode::Cell(sq) => graph.square_tgt(sq),
            DblNode::Spine(e) => e.clone(),
        }
    }

    /// Arity of node in the given virtual double graph.
    pub fn arity(&self, graph: &impl VDblGraph<E = E, Sq = Sq>) -> usize {
        match self {
            DblNode::Cell(sq) => graph.arity(sq),
            DblNode::Spine(_) => 0,
        }
    }

    /// Is the node contained in the given virtual double graph?
    pub fn contained_in(&self, graph: &impl VDblGraph<E = E, Sq = Sq>) -> bool {
        match self {
            DblNode::Cell(sq) => graph.has_square(sq),
            DblNode::Spine(e) => graph.has_edge(e),
        }
    }
}

/** A double tree, or pasting diagram in a virtual double category.

The underlying data structure of a double tree is a [open tree](OpenTree) whose
[nodes](DblNode) represent cells (or occasionally arrows) in the pasting
diagram. Not just any tree constitutes a valid pasting. The domains/codomains
and sources/targets of the cells must compatible, and [spines](DblNode::Spine)
can only appear in certain configurations.
 */
#[derive(Clone, Debug, From, PartialEq, Eq)]
pub struct DblTree<E, ProE, Sq>(pub OpenTree<ProE, DblNode<E, Sq>>);

impl<E, ProE, Sq> DblTree<E, ProE, Sq> {
    /// Constructs the empty or identity double tree.
    pub fn empty(p: ProE) -> Self {
        OpenTree::empty(p).into()
    }

    /// Constructs a double tree with a single square from a virtual double graph.
    pub fn single(sq: Sq, graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>) -> Self {
        let n = graph.arity(&sq);
        OpenTree::single(DblNode::Cell(sq), n).into()
    }

    /// Constructs a double tree of height two.
    pub fn two_level(
        squares: impl IntoIterator<Item = Sq>,
        base: Sq,
        graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>,
    ) -> Self {
        let subtrees = squares.into_iter().map(|sq| {
            let n = graph.arity(&sq);
            OpenTree::single(DblNode::Cell(sq), n)
        });
        OpenTree::graft(subtrees, DblNode::Cell(base)).into()
    }

    /// Domain of the tree in the given virtual double graph.
    pub fn dom<V>(
        &self,
        graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>,
    ) -> Path<V, ProE>
    where
        ProE: Clone,
    {
        // Helper function to perform the recursion.
        fn dom_at<V, E, ProE, Sq>(
            node: NodeRef<'_, Option<DblNode<E, Sq>>>,
            graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>,
        ) -> Path<V, ProE> {
            let path = node.get_value().unwrap().dom(graph);
            if node.children().all(|node| node.is_boundary()) {
                // In particular, handle special case that the node has no children.
                return path;
            }
            if path.is_empty() && node.has_children() {
                // Handle special case of nullary cells with spines.
                let child = node.children().exactly_one().ok().expect("Invalid nullary composite");
                return dom_at(child, graph);
            }
            // At this point, the path length must equal the number of children.
            let paths = zip_eq(node.children(), path)
                .map(|(child, proedge)| {
                    if child.is_boundary() {
                        Path::single(proedge)
                    } else {
                        dom_at(child, graph)
                    }
                })
                .collect_vec();
            Path::collect(paths).unwrap().flatten()
        }

        match &self.0 {
            OpenTree::Id(p) => p.clone().into(),
            OpenTree::Comp(tree) => dom_at(tree.root(), graph),
        }
    }

    /// Codomain of the tree in the given virtual double graph.
    pub fn cod(&self, graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>) -> ProE
    where
        ProE: Clone,
    {
        match &self.0 {
            OpenTree::Id(p) => p.clone(),
            OpenTree::Comp(tree) => tree
                .root()
                .get_value()
                .expect("Root of a double tree should not be null")
                .cod(graph)
                .only()
                .expect("Root of a double tree should not be a spine"),
        }
    }

    /// Source of the tree in the given virtual double graph.
    pub fn src<V>(&self, graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>) -> Path<V, E>
    where
        E: Clone,
    {
        match &self.0 {
            OpenTree::Id(p) => Path::empty(graph.src(p)),
            OpenTree::Comp(tree) => {
                let mut edges = tree
                    .root()
                    .left_boundary()
                    .filter_map(|node| node.get_value().map(|dn| dn.src(graph)))
                    .collect_vec();
                edges.reverse();
                Path::from_vec(edges).unwrap()
            }
        }
    }

    /// Target of the tree in the given virtual double graph.
    pub fn tgt<V>(&self, graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>) -> Path<V, E>
    where
        E: Clone,
    {
        match &self.0 {
            OpenTree::Id(p) => Path::empty(graph.tgt(p)),
            OpenTree::Comp(tree) => {
                let mut edges = tree
                    .root()
                    .right_boundary()
                    .filter_map(|node| node.get_value().map(|dn| dn.tgt(graph)))
                    .collect_vec();
                edges.reverse();
                Path::from_vec(edges).unwrap()
            }
        }
    }

    /** Arity of the cell specified by the double tree.

    Note that this arity can differ from the [arity](OpenTree::arity) of the
    underlying open tree due to the possibility of spines.
     */
    pub fn arity(&self, graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>) -> usize {
        match &self.0 {
            OpenTree::Id(_) => 1,
            OpenTree::Comp(tree) => tree
                .root()
                .boundary()
                .filter(|node| node.parent_value().unwrap().arity(graph) != 0)
                .count(),
        }
    }

    /** Is the double tree contained in the given virtual double graph?

    This includes checking whether the double tree is well-typed, i.e., that the
    domains and codomains, and sources and targets, of the cells are compatible.
     */
    pub fn contained_in(&self, graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>) -> bool
    where
        E: Eq + Clone,
        ProE: Eq + Clone,
    {
        let tree = match &self.0 {
            OpenTree::Id(p) => return graph.has_proedge(p),
            OpenTree::Comp(tree) => tree,
        };
        let root = tree.root();
        let mut traverse = root.bfs();
        while let Some(node) = traverse.next() {
            let Some(dn) = node.value() else {
                continue;
            };
            // The cell itself is contained in the graph.
            if !dn.contained_in(graph) {
                return false;
            }
            // Source and target edges are compatible.
            if !traverse
                .peek_at_same_level()
                .is_none_or(|next| Some(dn.tgt(graph)) == next.get_value().map(|dn| dn.src(graph)))
            {
                return false;
            }

            // Domain and codomain pro-edges are compatible.
            let path = dn.dom(graph);
            if path.is_empty() && node.has_children() {
                // Handle special cae of nullary cells with spines.
                if node
                    .children()
                    .exactly_one()
                    .ok()
                    .is_none_or(|child| child.get_value().is_some_and(|dn| dn.cod(graph) != path))
                {
                    return false;
                }
                continue;
            }
            // At this point, the path length must equal the number of children.
            for pair in node.children().zip_longest(path) {
                let Both(child, proedge) = pair else {
                    return false;
                };
                if child.get_value().is_some_and(|cn| cn.cod(graph) != Path::single(proedge)) {
                    return false;
                }
            }
        }
        true
    }

    /** Is the double tree isomorphic to another?

    This method simply checks whether the underlying open trees are
    [isomorphic](OpenTree::is_isomorphic_to).
     */
    pub fn is_isomorphic_to(&self, other: &Self) -> bool
    where
        E: Eq,
        ProE: Eq,
        Sq: Eq,
    {
        self.0.is_isomorphic_to(&other.0)
    }

    /// Maps over the edges and squares of the tree.
    pub fn map<CodE, CodSq>(
        self,
        mut fn_e: impl FnMut(E) -> CodE,
        mut fn_sq: impl FnMut(Sq) -> CodSq,
    ) -> DblTree<CodE, ProE, CodSq> {
        self.0
            .map(|dn| match dn {
                DblNode::Cell(sq) => DblNode::Cell(fn_sq(sq)),
                DblNode::Spine(e) => DblNode::Spine(fn_e(e)),
            })
            .into()
    }
}

impl<V, E, ProE, Sq> DblTree<Path<V, E>, ProE, DblTree<E, ProE, Sq>> {
    /// Flattens a double tree of double trees into a single double tree.
    pub fn flatten(self) -> DblTree<E, ProE, Sq> {
        let tree = self.0.map(|dn| match dn {
            DblNode::Cell(tree) => tree.0,
            DblNode::Spine(path) => OpenTree::linear(path.into_iter().map(DblNode::Spine))
                .expect("Spine should be a non-empty path"),
        });
        tree.flatten().into()
    }
}

#[cfg(test)]
mod tests {
    use ego_tree::tree;
    use nonempty::nonempty;

    use super::super::category::{WalkingBimodule as Bimod, WalkingFunctor as Funct, *};
    use super::*;

    #[test]
    fn tree_dom_cod() {
        let bimod = Bimod::Main();
        let graph = UnderlyingDblGraph(Bimod::Main());
        let path = Path::Seq(nonempty![Bimod::Pro::Left, Bimod::Pro::Middle, Bimod::Pro::Right]);
        let mid = bimod.composite_ext(path).unwrap();
        let tree = DblTree::two_level(
            vec![bimod.id_cell(Bimod::Pro::Left), mid.clone(), bimod.id_cell(Bimod::Pro::Right)],
            mid.clone(),
            &graph,
        );
        let tree_alt = tree!(
            Some(mid.clone()) => {
                Some(bimod.id_cell(Bimod::Pro::Left)) => { None },
                Some(mid.clone()) => { None, None, None },
                Some(bimod.id_cell(Bimod::Pro::Right)) => { None }
            }
        );
        let tree_alt = DblTree(OpenTree::from(tree_alt).map(DblNode::Cell));
        assert_eq!(tree, tree_alt);
        assert!(tree.contained_in(&graph));

        assert_eq!(tree.arity(&graph), 5);
        assert_eq!(
            tree.dom(&graph),
            Path::Seq(nonempty![
                Bimod::Pro::Left,
                Bimod::Pro::Left,
                Bimod::Pro::Middle,
                Bimod::Pro::Right,
                Bimod::Pro::Right
            ])
        );
        assert_eq!(tree.cod(&graph), Bimod::Pro::Middle);

        // Trees with incompatible (co)domains.
        let tree = tree!(
            Some(mid.clone()) => {
                Some(bimod.id_cell(Bimod::Pro::Left)) => { None },
                Some(mid.clone()) => { None, None, None }
            }
        );
        assert!(!DblTree(OpenTree::from(tree).map(DblNode::Cell)).contained_in(&graph));
        let tree = tree!(
            Some(mid.clone()) => {
                Some(bimod.id_cell(Bimod::Pro::Right)) => { None },
                Some(mid.clone()) => { None, None, None },
                Some(bimod.id_cell(Bimod::Pro::Left)) => { None }
            }
        );
        assert!(!DblTree(OpenTree::from(tree).map(DblNode::Cell)).contained_in(&graph));
    }

    #[test]
    fn tree_src_tgt() {
        let funct = Funct::Main();
        let graph = UnderlyingDblGraph(Funct::Main());
        let f = Funct::Arr::Arrow;
        let unit1 = funct.unit_ext(Funct::Ob::One).unwrap();
        let tree =
            DblTree(OpenTree::linear(vec![DblNode::Spine(f), DblNode::Cell(unit1)]).unwrap());
        let tree_alt = DblTree(
            tree!(
                Some(DblNode::Cell(unit1)) => { Some(DblNode::Spine(f)) => { None } }
            )
            .into(),
        );
        assert_eq!(tree, tree_alt);
        assert!(tree.contained_in(&graph));

        assert_eq!(tree.src(&graph), Path::pair(f, Funct::Arr::One));
        assert_eq!(tree.tgt(&graph), Path::pair(f, Funct::Arr::One));
        assert!(tree.dom(&graph).is_empty());

        // Trees with incompatible sources and targets.
        let comp = funct.composite2_ext(Funct::Ob::One, Funct::Ob::One).unwrap();
        let tree = DblTree(
            tree!(
                Some(DblNode::Cell(comp)) => {
                    Some(DblNode::Cell(unit1)) => {
                        Some(DblNode::Spine(Funct::Arr::One)) => { None }
                    },
                    Some(DblNode::Cell(unit1)) => {
                        Some(DblNode::Spine(f)) => { None }
                    },
                }
            )
            .into(),
        );
        assert!(!tree.contained_in(&graph));
    }

    #[test]
    fn flatten_tree() {
        let bimod = Bimod::Main();
        let graph = UnderlyingDblGraph(Bimod::Main());
        let path = Path::Seq(nonempty![Bimod::Pro::Left, Bimod::Pro::Middle, Bimod::Pro::Right]);
        let unitl = bimod.unit_ext(Bimod::Ob::Left).unwrap();
        let unitr = bimod.unit_ext(Bimod::Ob::Right).unwrap();
        let mid = bimod.composite_ext(path).unwrap();
        let tree = tree!(
            Some(mid.clone()) => {
                Some(bimod.id_cell(Bimod::Pro::Left)) => {
                    Some(unitl.clone())
                },
                Some(mid) => {
                    Some(unitl),
                    Some(bimod.id_cell(Bimod::Pro::Middle)) => { None },
                    Some(unitr.clone())
                },
                Some(bimod.id_cell(Bimod::Pro::Right)) => {
                    Some(unitr),
                }
            }
        );
        let tree = DblTree(OpenTree::from(tree).map(DblNode::Cell));
        assert_eq!(tree.dom(&graph), Path::single(Bimod::Pro::Middle));
        assert_eq!(tree.cod(&graph), Bimod::Pro::Middle);

        // Degenerate case: the outer tree is a singleton.
        let outer: DblTree<Path<Bimod::Ob, Bimod::Ob>, _, _> =
            OpenTree::single(DblNode::Cell(tree.clone()), tree.arity(&graph)).into();
        assert_eq!(outer.flatten(), tree);

        // Degenerate case: all inner trees are singletons.
        let outer: DblTree<Path<Bimod::Ob, Bimod::Ob>, _, _> =
            tree.clone().map(Path::single, |dn| DblTree::single(dn, &graph));
        let result = outer.flatten();
        assert!(result.is_isomorphic_to(&tree));
    }
}
