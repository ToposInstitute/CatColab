//! Trees with boundary.

use derive_more::From;
use ego_tree::{NodeRef, Tree};
use itertools::{Itertools, zip_eq};
use std::collections::VecDeque;

/// An open tree, or tree with boundary.
#[derive(Clone, Debug, From, PartialEq, Eq)]
pub enum OpenTree<Ty, Op> {
    /// The identity, or empty, tree on a type.
    Id(Ty),

    /// A nonempty tree, representing a nonempty composite of operations.
    #[from]
    Comp(Tree<Option<Op>>),
}

/// Extension trait for nodes in an open tree.
trait OpenNodeRef {
    /// Iterates over boundary of tree accessible from this node.
    fn boundary(&self) -> impl Iterator<Item = Self>;
}

impl<'a, T: 'a> OpenNodeRef for NodeRef<'a, Option<T>> {
    fn boundary(&self) -> impl Iterator<Item = Self> {
        self.descendants().filter(|node| node.value().is_none() && !node.has_children())
    }
}

impl<Ty, Op> OpenTree<Ty, OpenTree<Ty, Op>>
where
    Ty: Clone,
    Op: Clone,
{
    /// Flattens a tree of trees into a single tree.
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
