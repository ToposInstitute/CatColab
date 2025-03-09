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
#[derive(Clone, Debug, PartialEq, Eq)]
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
#[derive(Clone, Debug, From, PartialEq, Eq)]
pub struct DblTree<E, ProE, Sq>(pub Tree<DblNode<E, ProE, Sq>>);

impl<E, ProE, Sq> DblTree<E, ProE, Sq> {
    /// Constructs the empty or identity tree.
    pub fn empty(p: ProE) -> Self {
        Tree::new(DblNode::Id(p)).into()
    }

    /// Constructs a tree with a single square, its root.
    pub fn single(sq: Sq) -> Self {
        Tree::new(DblNode::Cell(sq)).into()
    }

    /// Constructs a tree a single spine node.
    pub fn spine(e: E) -> Self {
        Tree::new(DblNode::Spine(e)).into()
    }

    /// Construct a tree from a non-empty path of edges.
    pub fn spines<V>(path: Path<V, E>) -> Option<Self> {
        match path {
            Path::Seq(edges) => {
                let mut edges: Vec<_> = edges.into_iter().collect();
                let mut tree = Tree::new(DblNode::Spine(edges.pop().unwrap()));
                let mut node_id = tree.root().id();
                for e in edges.into_iter().rev() {
                    node_id = tree.get_mut(node_id).unwrap().append(DblNode::Spine(e)).id();
                }
                Some(tree.into())
            }
            Path::Id(_) => None,
        }
    }

    /// Constructs a tree of a height two.
    pub fn two_level(leaves: impl IntoIterator<Item = Sq>, base: Sq) -> Self {
        Self::graft(leaves.into_iter().map(DblTree::single), base)
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
        self.0.root().descendants().filter_map(|node| {
            if node.has_children() {
                None
            } else {
                Some(node.value())
            }
        })
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
        let mut edges: Vec<_> = self.tgt_nodes().map(|dn| dn.tgt(graph)).collect();
        edges.reverse();
        Path::from_vec(edges).unwrap().flatten()
    }

    /// Arity of the composite cell specified by the tree.
    pub fn arity(&self, graph: &impl VDblGraph<E = E, ProE = ProE, Sq = Sq>) -> usize {
        self.leaves().map(|dn| dn.arity(graph)).sum()
    }
}

impl<V, E, ProE, Sq> DblNode<Path<V, E>, ProE, DblTree<E, ProE, Sq>> {
    /// Flattens a node containing another tree.
    fn flatten(self) -> DblTree<E, ProE, Sq> {
        match self {
            DblNode::Cell(tree) => tree,
            DblNode::Id(m) => DblTree::empty(m),
            DblNode::Spine(path) => {
                DblTree::spines(path).expect("Spine should be a non-empty path")
            }
        }
    }
}

impl<V, E, ProE, Sq> DblTree<Path<V, E>, ProE, DblTree<E, ProE, Sq>>
where
    V: Clone,
    E: Clone,
    ProE: Clone + Eq + std::fmt::Debug,
    Sq: Clone,
{
    /// Flattens a tree of trees into a single tree.
    pub fn flatten_in(
        &self,
        graph: &impl VDblGraph<V = V, E = E, ProE = ProE, Sq = Sq>,
    ) -> DblTree<E, ProE, Sq> {
        // Initialize flattened tree using the root of the outer tree.
        let outer_root = self.0.root();
        let mut tree = outer_root.value().clone().flatten().0;

        // We'll iterate in depth-first order over non-root nodes in outer tree.
        let mut outer_nodes = outer_root.descendants();
        outer_nodes.next();

        let mut stack = Vec::new();
        if outer_root.has_children() {
            stack.push(tree.root().id());
        }

        while let Some(node_id) = stack.pop() {
            let mut new_subtree_ids = Vec::new();
            let leaf_ids: Vec<_> = tree
                .get(node_id)
                .unwrap()
                .descendants()
                .filter_map(|node| {
                    if node.has_children() {
                        None
                    } else {
                        Some(node.id())
                    }
                })
                .collect();
            for leaf_id in leaf_ids {
                let mut leaf = tree.get_mut(leaf_id).unwrap();
                for m in leaf.value().dom(graph) {
                    let outer_node =
                        outer_nodes.next().expect("Should have enough nodes in outer tree");

                    let inner_tree = outer_node.value().clone().flatten();
                    assert_eq!(m, inner_tree.cod(graph), "(Co)domains should be compatible");

                    let subtree_id = leaf.append_subtree(inner_tree.0).id();
                    if outer_node.has_children() {
                        new_subtree_ids.push(subtree_id);
                    }
                }
            }
            new_subtree_ids.reverse();
            stack.append(&mut new_subtree_ids);
        }

        assert!(outer_nodes.next().is_none(), "Should not have extra nodes in outer tree");
        tree.into()
    }
}

#[cfg(test)]
mod tests {
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
            mid,
        );
        assert_eq!(tree.leaves().count(), 3);
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
    }

    #[test]
    fn tree_src_tgt() {
        let funct = Funct::Main();
        let graph = UnderlyingDblGraph(Funct::Main());
        let f = Funct::Arr::Arrow;
        let tree = DblTree::<_, Funct::Ob, _>::graft(
            vec![DblTree::spine(f), DblTree::spine(f)],
            funct.composite_ext(Path::pair(Funct::Ob::One, Funct::Ob::One)).unwrap(),
        );
        assert_eq!(tree.src_nodes().count(), 2);
        assert_eq!(tree.tgt_nodes().count(), 2);
        assert_eq!(tree.src(&graph), Path::pair(f, Funct::Arr::One));
        assert_eq!(tree.tgt(&graph), Path::pair(f, Funct::Arr::One));
    }

    #[test]
    fn flatten_tree() {
        let bimod = Bimod::Main();
        let graph = UnderlyingDblGraph(Bimod::Main());

        // Degenerate case: the outer tree is a singleton.
        let path = Path::Seq(nonempty![Bimod::Pro::Left, Bimod::Pro::Middle, Bimod::Pro::Right]);
        let mid = bimod.composite_ext(path).unwrap();
        let tree = DblTree::two_level(
            vec![bimod.id_cell(Bimod::Pro::Left), mid.clone(), bimod.id_cell(Bimod::Pro::Right)],
            mid.clone(),
        );
        let outer = DblTree::single(tree.clone());
        assert_eq!(outer.flatten_in(&graph), tree);

        // Degenerate case: all inner trees are singletons.
        let outer = DblTree::two_level(
            vec![
                DblTree::single(bimod.id_cell(Bimod::Pro::Left)),
                DblTree::single(mid.clone()),
                DblTree::single(bimod.id_cell(Bimod::Pro::Right)),
            ],
            DblTree::single(mid.clone()),
        );
        assert_eq!(outer.flatten_in(&graph), tree);
    }
}
