//! Trees with boundary.
//!
//! Trees are an ubiquitous data structure in computer science and computer algebra.
//! This module implements trees with specified boundary, or [*open
//! trees*](OpenTree) for short. This is the category theorist's preferred notion of
//! planar tree, since open trees are the morphisms of free multicategories.
//!
//! To see the difference between (closed) trees and open trees, consider their use
//! to represent symbolic expressions. A closed expression tree cannot, except by
//! convention, distinguish between free variables and constants (nullary
//! operations). However, when boundaries are admitted, the expression `f(x, g(y))`
//! with free variables `x` and `y` can be represented as an open tree of with arity
//! 2, whereas the expression `f(c, g(d))`, shorthand for `f(c(), g(d()))`, is
//! represented as an open tree with arity 0.
//!
//! A subtle but important feature of open trees is that they include [*identity*
//! trees](OpenTree::Id), which carry a type but have no nodes. By contrast, the
//! computer scientist's tree is rooted, which implies that it has at least one
//! node, namely its root.
//!
//! The main use of open trees in this crate is to implement [double
//! trees](crate::dbl::tree).
//!
//! # References
//!
//! Joachim Kock has proposed a combinatorial formalism for open trees ([Kock
//! 2011](crate::refs::KockTrees)) and, in the same style, open graphs ([Kock
//! 2016](crate::refs::KockGraphs)). Kock's trees are similar in spirit to ours but
//! are nonplanar, i.e., are the morphisms of free *symmetric* multicategories.

use derive_more::From;
use ego_tree::{NodeRef, Tree};
use itertools::{Itertools, zip_eq};
use std::collections::VecDeque;

use super::tree_algorithms::TreeIsomorphism;

/// An open tree, or tree with boundary.
///
/// In a non-empty open tree, backed by a [`Tree`], each node carries either an
/// operation or a null value. The null nodes constitute the boundary of the tree.
/// It is an error for null nodes to have children or for the root to be null.
/// Failure to maintain this invariant may result in panics.
///
/// Compare with the [`Path`](super::path::Path) data type, of which this type may
/// be considered a generalization.
#[derive(Clone, Debug, From, PartialEq, Eq)]
pub enum OpenTree<Ty, Op> {
    /// The identity, or empty, tree on a type.
    Id(Ty),

    /// A rooted tree, representing a nonempty composite of operations.
    #[from]
    Comp(Tree<Option<Op>>),
}

impl<Ty, Op> OpenTree<Ty, Op> {
    /// Constructs the empty or identity tree.
    pub fn empty(ty: Ty) -> Self {
        OpenTree::Id(ty)
    }

    /// Constructs a singleton tree with the given arity.
    pub fn single(op: Op, arity: usize) -> Self {
        let mut tree = Tree::new(Some(op));
        for _ in 0..arity {
            tree.root_mut().append(None);
        }
        tree.into()
    }

    /// Constructs an open tree by grafting subtrees onto a root operation.
    ///
    /// The root operation is *assumed* to have arity equal to the number of
    /// subtrees.
    pub fn graft(subtrees: impl IntoIterator<Item = Self>, op: Op) -> Self {
        let mut tree = Tree::new(Some(op));
        for subtree in subtrees {
            match subtree {
                OpenTree::Id(_) => tree.root_mut().append(None),
                OpenTree::Comp(subtree) => tree.root_mut().append_subtree(subtree),
            };
        }
        tree.into()
    }

    /// Constructs a linear open tree from a sequence of unary operations.
    ///
    /// Each operation is *assumed* to be unary. This constructor returns nothing if
    /// the sequence is empty.
    pub fn linear(iter: impl IntoIterator<Item = Op>) -> Option<Self> {
        let mut values: Vec<_> = iter.into_iter().collect();
        let value = values.pop()?;
        let mut tree = Tree::new(Some(value));
        let mut node_id = tree.root().id();
        for value in values.into_iter().rev() {
            node_id = tree.get_mut(node_id).unwrap().append(Some(value)).id();
        }
        tree.get_mut(node_id).unwrap().append(None);
        Some(tree.into())
    }

    /// Gets the arity of the open tree.
    ///
    /// The *arity* of an open tree is the number of boundary nodes in it.
    pub fn arity(&self) -> usize {
        match self {
            OpenTree::Comp(tree) => tree.root().boundary().count(),
            OpenTree::Id(_) => 1,
        }
    }

    /// Gets the size of the open tree.
    ///
    /// The *size* of an open tree is the number of non-boundary nodes in it,
    /// ignoring orphans.
    pub fn size(&self) -> usize {
        match self {
            OpenTree::Comp(tree) => tree.nodes().filter(|node| node.value().is_some()).count(),
            OpenTree::Id(_) => 0,
        }
    }

    /// Is the open tree empty?
    pub fn is_empty(&self) -> bool {
        matches!(self, OpenTree::Id(_))
    }

    /// Extracts the unique node in a tree of size 1.
    ///
    /// This method is a one-sided inverse to [`OpenTree::single`].
    pub fn only(self) -> Option<Op> {
        if let OpenTree::Comp(mut tree) = self
            && tree.root().children().all(|node| node.value().is_none())
        {
            std::mem::take(tree.root_mut().value())
        } else {
            None
        }
    }

    /// Is the open tree isomorphic to another?
    ///
    /// Open trees should generally be compared for
    /// [isomorphism](TreeIsomorphism::is_isomorphic_to) rather than equality
    /// because, among other reasons, the [`flatten`](OpenTree::flatten) method
    /// produces orphan nodes.
    pub fn is_isomorphic_to(&self, other: &Self) -> bool
    where
        Ty: Eq,
        Op: Eq,
    {
        match (self, other) {
            (OpenTree::Comp(tree1), OpenTree::Comp(tree2)) => tree1.is_isomorphic_to(tree2),
            (OpenTree::Id(type1), OpenTree::Id(type2)) => *type1 == *type2,
            _ => false,
        }
    }

    /// Maps over the operations in the tree.
    pub fn map<CodOp>(self, mut f: impl FnMut(Op) -> CodOp) -> OpenTree<Ty, CodOp> {
        match self {
            OpenTree::Comp(tree) => tree.map(|value| value.map(&mut f)).into(),
            OpenTree::Id(ty) => OpenTree::Id(ty),
        }
    }
}

/// Extension trait for nodes in an [open tree](OpenTree).
pub trait OpenNodeRef<T> {
    /// Is this node a boundary node?
    fn is_boundary(&self) -> bool;

    /// Iterates over boundary of tree accessible from this node.
    fn boundary(&self) -> impl Iterator<Item = Self>;

    /// Gets a reference to the value of this node, if it has one.
    fn get_value(&self) -> Option<&T>;

    /// Gets a reference to the value of this node's parent, if it has a parent.
    fn parent_value(&self) -> Option<&T>;
}

impl<'a, T: 'a> OpenNodeRef<T> for NodeRef<'a, Option<T>> {
    fn is_boundary(&self) -> bool {
        let is_null = self.value().is_none();
        assert!(!(is_null && self.has_children()), "Boundary nodes should be leaves");
        is_null
    }

    fn boundary(&self) -> impl Iterator<Item = Self> {
        self.descendants().filter(|node| node.is_boundary())
    }

    fn get_value(&self) -> Option<&T> {
        self.value().as_ref()
    }

    fn parent_value(&self) -> Option<&T> {
        self.parent()
            .map(|p| p.value().as_ref().expect("Inner nodes should not be null"))
    }
}

impl<Ty, Op> OpenTree<Ty, OpenTree<Ty, Op>> {
    /// Flattens an open tree of open trees into a single open tree.
    pub fn flatten(self) -> OpenTree<Ty, Op> {
        // Handle degenerate case that outer tree is an identity.
        let mut outer_tree = match self {
            OpenTree::Id(x) => return OpenTree::Id(x),
            OpenTree::Comp(tree) => tree,
        };

        // Initialize flattened tree using the root of the outer tree.
        let value = std::mem::take(outer_tree.root_mut().value())
            .expect("Root node of outer tree should contain a tree");
        let (mut tree, root_type) = match value {
            OpenTree::Id(x) => (Tree::new(None), Some(x)),
            OpenTree::Comp(tree) => (tree, None),
        };

        let mut queue = VecDeque::new();
        for (child, leaf) in zip_eq(outer_tree.root().children(), tree.root().boundary()) {
            queue.push_back((child.id(), leaf.id()));
        }

        while let Some((outer_id, leaf_id)) = queue.pop_front() {
            let Some(value) = std::mem::take(outer_tree.get_mut(outer_id).unwrap().value()) else {
                continue;
            };
            match value {
                OpenTree::Id(_) => {
                    let Ok(outer_parent) =
                        outer_tree.get(outer_id).unwrap().children().exactly_one()
                    else {
                        panic!("Identity tree should have exactly one parent")
                    };
                    queue.push_back((outer_parent.id(), leaf_id));
                }
                OpenTree::Comp(inner_tree) => {
                    let subtree_id = tree.extend_tree(inner_tree).id();
                    let value = std::mem::take(tree.get_mut(subtree_id).unwrap().value());

                    let mut inner_node = tree.get_mut(leaf_id).unwrap();
                    *inner_node.value() = value;
                    inner_node.reparent_from_id_append(subtree_id);

                    let outer_node = outer_tree.get(outer_id).unwrap();
                    let inner_node: NodeRef<_> = inner_node.into();
                    for (child, leaf) in zip_eq(outer_node.children(), inner_node.boundary()) {
                        queue.push_back((child.id(), leaf.id()));
                    }
                }
            }
        }

        if tree.root().value().is_none() {
            OpenTree::Id(root_type.unwrap())
        } else {
            tree.into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ego_tree::tree;

    type OT = OpenTree<char, char>;

    #[test]
    fn construct_tree() {
        assert_eq!(OT::empty('X').arity(), 1);

        let tree = OT::single('f', 2);
        assert_eq!(tree.arity(), 2);
        assert_eq!(tree, tree!(Some('f') => { None, None }).into());
        assert_eq!(tree.only(), Some('f'));

        let tree = tree!(Some('h') => { Some('g') => { Some('f') => { None } } });
        assert_eq!(OT::linear(vec!['f', 'g', 'h']), Some(tree.into()));
    }

    #[test]
    fn flatten_tree() {
        // Typical cases.
        let tree = OT::from(tree!(
            Some('f') => {
                Some('h') => {
                    Some('k') => { None, None},
                    None,
                },
                Some('g') => {
                    None,
                    Some('l') => { None, None }
                },
            }
        ));
        assert!(!tree.is_empty());
        assert_eq!(tree.size(), 5);
        assert_eq!(tree.arity(), 6);

        let subtree1 = OT::from(tree!(
            Some('f') => {
                None,
                Some('g') => { None, None },
            }
        ));
        let subtree2 = OT::from(tree!(
            Some('h') => {
                Some('k') => { None, None },
                None
            }
        ));
        let subtree3 = OT::from(tree!(
            Some('l') => { None, None }
        ));

        let outer_tree: OpenTree<_, _> = tree!(
            Some(subtree1.clone()) => {
                Some(subtree2.clone()) => { None, None, None },
                None,
                Some(subtree3.clone()) => { None, None },
            }
        )
        .into();
        assert!(outer_tree.flatten().is_isomorphic_to(&tree));

        let outer_tree: OpenTree<_, _> = tree!(
            Some(subtree1) => {
                Some(OpenTree::Id('X')) => {
                    Some(subtree2) => { None, None, None },
                },
                Some(OpenTree::Id('X')) => { None },
                Some(OpenTree::Id('X')) => {
                    Some(subtree3) => { None, None },
                },
            }
        )
        .into();
        assert!(outer_tree.flatten().is_isomorphic_to(&tree));

        // Special case: outer tree is identity.
        let outer_tree: OpenTree<_, _> = OpenTree::Id('X');
        assert_eq!(outer_tree.flatten(), OT::Id('X'));

        // Special case: every inner tree is an identity.
        let outer_tree: OpenTree<_, _> = tree!(
            Some(OT::Id('X')) => { Some(OT::Id('x')) => { None } }
        )
        .into();
        assert_eq!(outer_tree.flatten(), OT::Id('X'));
    }
}
