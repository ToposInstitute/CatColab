/*! Double trees: composition patterns in virtual double categories.

A *double tree* (nonstandard term) is the data structure for a [pasting
diagram](https://ncatlab.org/nlab/show/pasting+diagram) in a virtual double
category, i.e., the unbiased specification of a composite of cells in a virtual
double category.
 */

use derive_more::From;
use ego_tree::Tree;

use super::graph::VDblGraph;
use crate::one::path::Path;

/// Value of a node in a [double tree](DblTree).
#[derive(Clone, Debug)]
pub enum DblNode<Pro, Sq> {
    /** The identity cell on a pro-edge in a virtual double graph.

    Any node with an identity as its value should be a leaf node. We enforce
    this invariant in order to get a normal form for pastings in VDCs.
     */
    Id(Pro),

    /// A generic cell, given by a square in a virtual double graph.
    Cell(Sq),
}

impl<Pro, Sq> DblNode<Pro, Sq> {
    /// Is the node an identity?
    pub fn is_id(&self) -> bool {
        matches!(*self, DblNode::Id(_))
    }

    /// Is the node a generic cell?
    pub fn is_cell(&self) -> bool {
        matches!(*self, DblNode::Cell(_))
    }

    /// Domain of node in the given virtual double graph.
    pub fn dom<V>(&self, graph: &impl VDblGraph<V = V, ProE = Pro, Sq = Sq>) -> Path<V, Pro>
    where
        Pro: Clone,
    {
        match self {
            DblNode::Id(p) => Path::single(p.clone()),
            DblNode::Cell(sq) => graph.square_dom(sq),
        }
    }

    /// Codomain of node in the given virtual double graph.
    pub fn cod(&self, graph: &impl VDblGraph<ProE = Pro, Sq = Sq>) -> Pro
    where
        Pro: Clone,
    {
        match self {
            DblNode::Id(p) => p.clone(),
            DblNode::Cell(sq) => graph.square_cod(sq),
        }
    }

    /// Source of node in the given virtual double graph.
    pub fn src<V, Arr>(
        &self,
        graph: &impl VDblGraph<V = V, E = Arr, ProE = Pro, Sq = Sq>,
    ) -> Path<V, Arr> {
        match self {
            DblNode::Id(p) => Path::empty(graph.src(p)),
            DblNode::Cell(sq) => Path::single(graph.square_src(sq)),
        }
    }

    /// Target of node in the given virtual double graph.
    pub fn tgt<V, Arr>(
        &self,
        graph: &impl VDblGraph<V = V, E = Arr, ProE = Pro, Sq = Sq>,
    ) -> Path<V, Arr> {
        match self {
            DblNode::Id(p) => Path::empty(graph.tgt(p)),
            DblNode::Cell(sq) => Path::single(graph.square_tgt(sq)),
        }
    }
}

/** A double tree.

TODO: Describe the data structure
*/
#[derive(Clone, Debug, From)]
pub struct DblTree<Pro, Sq>(pub Tree<DblNode<Pro, Sq>>);

impl<Pro, Sq> DblTree<Pro, Sq> {
    /// Constructs the empty or identity tree.
    pub fn empty(p: Pro) -> Self {
        Tree::new(DblNode::Id(p)).into()
    }

    /// Constructs a tree with a single node, its root.
    pub fn single(sq: Sq) -> Self {
        Tree::new(DblNode::Cell(sq)).into()
    }

    /// Constructs a tree by grafting trees as subtrees onto a base cell.
    pub fn graft(base: Sq, subtrees: impl IntoIterator<Item = Self>) -> Self {
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
    pub fn root(&self) -> &DblNode<Pro, Sq> {
        self.0.root().value()
    }

    /// Iterates over the leaves of the double tree.
    pub fn leaves(&self) -> impl Iterator<Item = &DblNode<Pro, Sq>> {
        self.0
            .root()
            .descendants()
            .filter(|node| !node.has_children())
            .map(|node| node.value())
    }

    /// Domain of the tree in the given virtual double graph.
    pub fn dom<V>(&self, graph: &impl VDblGraph<V = V, ProE = Pro, Sq = Sq>) -> Path<V, Pro>
    where
        Pro: Clone,
    {
        Path::collect(self.leaves().map(|dn| dn.dom(graph))).unwrap().flatten()
    }

    /// Codomain of the tree in the given virtual double graph.
    pub fn cod(&self, graph: &impl VDblGraph<ProE = Pro, Sq = Sq>) -> Pro
    where
        Pro: Clone,
    {
        self.root().cod(graph)
    }
}
