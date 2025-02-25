//! Double trees: composition patterns in virtual double categories.

use ego_tree::Tree;

//use super::graph::VDblGraph;

/// TODO
pub enum DblTree<Pro, Sq> {
    /// The identity, or empty, tree at a pro-edge.
    Id(Pro),

    /// A nonempty tree, representing a nontrivial composite of squares.
    Comp(Tree<Option<Sq>>)
}

impl<Pro, Sq> DblTree<Pro, Sq> {
    /// Constructs the empty or identity tree.
    pub fn empty(p: Pro) -> Self {
        DblTree::Id(p)
    }

    /// Constructs the tree with a single node, the root.
    pub fn single(sq: Sq) -> Self {
        DblTree::Comp(Tree::new(Some(sq)))
    }

    /// Constructs by grafting trees as subtrees onto a new root.
    pub fn graft(base: Sq, subtrees: impl IntoIterator<Item = Self>) -> Self {
        let mut tree = Tree::new(Some(base));
        for subtree in subtrees {
            if let DblTree::Comp(subtree) = subtree {
                tree.root_mut().append_subtree(subtree);
            } else {
                tree.root_mut().append(None);
            }
        }
        DblTree::Comp(tree)
    }

    /// Gets the root of the tree, if it is nonempty.
    pub fn root(&self) -> Option<&Sq> {
        if let DblTree::Comp(tree) = self {
            Some(tree.root().value().as_ref().expect("Root of tree should be a square"))
        } else {
            None
        }
    }
}
