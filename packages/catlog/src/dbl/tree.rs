/*! Double trees: pasting diagrams in virtual double categories.

A *double tree* (nonstandard term) is the data structure for a [pasting
diagram](https://ncatlab.org/nlab/show/pasting+diagram) in a virtual double
category. In other words, a double tree specifies, in the most general and
unbiased form, a composite of cells in a virtual double category.
 */

use derive_more::From;
use ego_tree::Tree;

use super::graph::VDblGraph;
use crate::one::path::Path;

/** A node in a [double tree](DblTree).

To be more precise, this enum is the type of a *value* carried by a node in a
double tree.
 */
#[derive(Clone, Debug)]
pub enum DblNode<E, ProE, Sq> {
    /// A generic cell, given by a square in a virtual double graph.
    Cell(Sq),

    /** The identity cell on a pro-edge in a virtual double graph.

    Any node with an identity as its value should be a leaf node. While not
    logically required, we enforce this invariant to obtain a normal form for
    pastings in VDCs.
     */
    Id(ProE),

    /** An edge dangling from a nullary cell.

    In a well-formed double tree, a spine node can be a child only of a nullary
    cell or of another spine node. Spines represent the operation of
    precomposing a nullary cell with an arrow to obtain another nullary cell, a
    degenerate case of composition in a virtual double category.
     */
    Spine(E),
}

impl<E, ProE, Sq> DblNode<E, ProE, Sq> {
    /// Is the node a generic cell?
    pub fn is_cell(&self) -> bool {
        matches!(*self, DblNode::Cell(_))
    }

    /// Is the node an identity?
    pub fn is_id(&self) -> bool {
        matches!(*self, DblNode::Id(_))
    }

    /// Is the node a spine?
    pub fn is_spine(&self) -> bool {
        matches!(*self, DblNode::Spine(_))
    }

    /// Domain of node in the given virtual double graph.
    pub fn dom<V>(
        &self,
        graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>,
    ) -> Path<V, ProE>
    where
        ProE: Clone,
    {
        match self {
            DblNode::Cell(sq) => graph.square_dom(sq),
            DblNode::Id(p) => Path::single(p.clone()),
            DblNode::Spine(e) => Path::empty(graph.dom(e)),
        }
    }

    /// Codomain of node in the given virtual double graph.
    pub fn cod(&self, graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>) -> ProE
    where
        ProE: Clone,
    {
        match self {
            DblNode::Cell(sq) => graph.square_cod(sq),
            DblNode::Id(p) => p.clone(),
            DblNode::Spine(_) => panic!("A spine node does not have a unary codomain"),
        }
    }

    /// Source of node in the given virtual double graph.
    pub fn src<V>(&self, graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>) -> Path<V, E>
    where
        E: Clone,
    {
        match self {
            DblNode::Cell(sq) => Path::single(graph.square_src(sq)),
            DblNode::Id(p) => Path::empty(graph.src(p)),
            DblNode::Spine(e) => Path::single(e.clone()),
        }
    }

    /// Target of node in the given virtual double graph.
    pub fn tgt<V>(&self, graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>) -> Path<V, E>
    where
        E: Clone,
    {
        match self {
            DblNode::Cell(sq) => Path::single(graph.square_tgt(sq)),
            DblNode::Id(p) => Path::empty(graph.tgt(p)),
            DblNode::Spine(e) => Path::single(e.clone()),
        }
    }

    /// Arity of node in the given virtual double graph.
    pub fn arity(&self, graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>) -> usize {
        match self {
            DblNode::Cell(sq) => graph.arity(sq),
            DblNode::Id(_) => 1,
            DblNode::Spine(_) => 0,
        }
    }
}

/** A double tree, or pasting diagram in a virtual double category.

As the name suggests, the underlying data structure of a double tree is a
[`Tree`] whose [nodes](DblNode) represent cells (or occasionally arrows) in the
pasting diagram. Not just any underlying tree constitutes a valid pasting. For
example, the domains/codomains and sources/targets of the cells must compatible,
and [spines](DblNode::Spine) can only appear in certain configurations.
Moreover, among the valid trees, invariants are maintained to ensure a normal
form among equivalent representations of the same pasting.

TODO: Implement validation using breadth-first search to check that
sources/targets of cells are compatible.

TODO: Enforce invariant with identities when `graft`-ing.
*/
#[derive(Clone, Debug, From)]
pub struct DblTree<E, ProE, Sq>(pub Tree<DblNode<E, ProE, Sq>>);

impl<E, ProE, Sq> DblTree<E, ProE, Sq> {
    /// Constructs the empty or identity tree.
    pub fn empty(p: ProE) -> Self {
        Tree::new(DblNode::Id(p)).into()
    }

    /// Constructs a tree with a single node, its root.
    pub fn single(sq: Sq) -> Self {
        Tree::new(DblNode::Cell(sq)).into()
    }

    /// Constructs a tree by grafting trees as subtrees onto a base cell.
    pub fn graft(subtrees: impl IntoIterator<Item = Self>, base: Sq) -> Self {
        let mut tree = Tree::new(DblNode::Cell(base));
        for subtree in subtrees {
            tree.root_mut().append_subtree(subtree.0);
        }
        tree.into()
    }

    /** The size of the tree.

    The **size** of a double tree is the number of non-identity nodes in it.
     */
    pub fn size(&self) -> usize {
        self.0.values().filter(|dn| dn.is_cell()).count()
    }

    /** Is the tree empty?

    A double tree is **empty** if its sole node, the root, is an identity.
    */
    pub fn is_empty(&self) -> bool {
        let root = self.0.root();
        let root_is_id = root.value().is_id();
        assert!(!(root_is_id && root.has_children()), "Identity node should not have children");
        root_is_id
    }

    /// Gets the root of the double tree.
    pub fn root(&self) -> &DblNode<E, ProE, Sq> {
        self.0.root().value()
    }

    /// Iterates over the leaves of the double tree.
    pub fn leaves(&self) -> impl Iterator<Item = &DblNode<E, ProE, Sq>> {
        self.0
            .root()
            .descendants()
            .filter(|node| !node.has_children())
            .map(|node| node.value())
    }

    /** Iterates over nodes along the source (left) boundary of the double tree.

    *Warning*: iteration proceeds from the tree's root to its left-most leaf,
    which is the opposite order of the path of edges.
     */
    pub fn src_nodes(&self) -> impl Iterator<Item = &DblNode<E, ProE, Sq>> {
        let mut maybe_node = Some(self.0.root());
        std::iter::from_fn(move || {
            let prev = maybe_node;
            maybe_node = maybe_node.and_then(|node| node.first_child());
            prev.map(|node| node.value())
        })
    }

    /** Iterates over nodes along the target (right) boundary of the double tree.

    *Warning*: iteration proceeds from the tree's root to its right-most leaf,
    which is the opposite order of the path of edges.
     */
    pub fn tgt_nodes(&self) -> impl Iterator<Item = &DblNode<E, ProE, Sq>> {
        let mut maybe_node = Some(self.0.root());
        std::iter::from_fn(move || {
            let prev = maybe_node;
            maybe_node = maybe_node.and_then(|node| node.last_child());
            prev.map(|node| node.value())
        })
    }

    /// Domain of the tree in the given virtual double graph.
    pub fn dom<V>(
        &self,
        graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>,
    ) -> Path<V, ProE>
    where
        ProE: Clone,
    {
        Path::collect(self.leaves().map(|dn| dn.dom(graph))).unwrap().flatten()
    }

    /// Codomain of the tree in the given virtual double graph.
    pub fn cod(&self, graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>) -> ProE
    where
        ProE: Clone,
    {
        self.root().cod(graph)
    }

    /// Source of the tree in the given virtual double graph.
    pub fn src<V>(&self, graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>) -> Path<V, E>
    where
        E: Clone,
    {
        let mut edges: Vec<_> = self.src_nodes().map(|dn| dn.src(graph)).collect();
        edges.reverse();
        Path::from_vec(edges).unwrap().flatten()
    }

    /// Target of the tree in the given virtual double graph.
    pub fn tgt<V>(&self, graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>) -> Path<V, E>
    where
        E: Clone,
    {
        let mut edges: Vec<_> = self.tgt_nodes().map(|dn| dn.src(graph)).collect();
        edges.reverse();
        Path::from_vec(edges).unwrap().flatten()
    }

    /// Arity of the composite cell specified by the tree.
    pub fn arity(&self, graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>) -> usize {
        self.leaves().map(|dn| dn.arity(graph)).sum()
    }
}
