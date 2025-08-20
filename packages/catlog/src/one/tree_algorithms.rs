//! Algorithms on trees.

use ego_tree::iter::{Descendants, Edge};
use ego_tree::{NodeId, NodeRef, Tree};
use itertools::{EitherOrBoth::Both, Itertools};
use std::collections::VecDeque;

/// Extension trait adding traversal algorithms on [trees](Tree).
pub trait TreeTraversal<T> {
    /// Iterates over descendants of node in depth-first order.
    fn dfs(&self) -> Descendants<'_, T>;

    /// Iterates over descendants of node in breadth-first order.
    fn bfs(&self) -> BreadthFirstTraversal<'_, T>;

    /// Iterates over left boundary of node.
    fn left_boundary(&self) -> impl Iterator<Item = Self>;

    /// Iterates over right boundary of node.
    fn right_boundary(&self) -> impl Iterator<Item = Self>;
}

/// Iterator for traversing a tree in breadth-first order.
pub struct BreadthFirstTraversal<'a, T: 'a> {
    tree: &'a Tree<T>,
    queue: VecDeque<(NodeId, usize)>,
    current_level: usize,
}

impl<'a, T: 'a> BreadthFirstTraversal<'a, T> {
    /// Initialize a breadth-first traversal at the given node.
    pub fn starting_at(root: NodeRef<'a, T>) -> Self {
        let tree = root.tree();
        let mut queue = VecDeque::new();
        queue.push_back((root.id(), 1));
        Self {
            tree,
            queue,
            current_level: 0,
        }
    }

    /// Peeks at the next node, if it's at the same level as the previous one.
    pub fn peek_at_same_level(&self) -> Option<NodeRef<'a, T>> {
        self.queue.front().and_then(|(id, level)| {
            if *level == self.current_level {
                self.tree.get(*id)
            } else {
                None
            }
        })
    }
}

impl<'a, T: 'a> Iterator for BreadthFirstTraversal<'a, T> {
    type Item = NodeRef<'a, T>;

    fn next(&mut self) -> Option<Self::Item> {
        let (id, level) = self.queue.pop_front()?;
        self.current_level = level;
        let node = self.tree.get(id).unwrap();
        for child in node.children() {
            self.queue.push_back((child.id(), level + 1));
        }
        Some(node)
    }
}

impl<'a, T: 'a> std::iter::FusedIterator for BreadthFirstTraversal<'a, T> {}

impl<'a, T: 'a> TreeTraversal<T> for NodeRef<'a, T> {
    /// Uses the built-in traversal algorithm, which is depth-first, though that
    /// is not documented: <https://github.com/rust-scraper/ego-tree/issues/38>
    fn dfs(&self) -> Descendants<'a, T> {
        self.descendants()
    }

    /// Implements the standard BFS algorithm using a queue.
    fn bfs(&self) -> BreadthFirstTraversal<'a, T> {
        BreadthFirstTraversal::starting_at(*self)
    }

    fn left_boundary(&self) -> impl Iterator<Item = Self> {
        let mut maybe_node = Some(*self);
        std::iter::from_fn(move || {
            let prev = maybe_node;
            maybe_node = maybe_node.and_then(|node| node.first_child());
            prev
        })
    }

    fn right_boundary(&self) -> impl Iterator<Item = Self> {
        let mut maybe_node = Some(*self);
        std::iter::from_fn(move || {
            let prev = maybe_node;
            maybe_node = maybe_node.and_then(|node| node.last_child());
            prev
        })
    }
}

/// Extension trait adding isomorphism checking on [trees](Tree).
pub trait TreeIsomorphism<T> {
    /** Is the tree isomorphic to another?

    The standard data structure for trees based on pointers has only one notion
    of "sameness" that makes sense, but for vector-backed trees with node IDs,
    trees can be isomorphic (logically the same) without having underlying data
    that is equal. This methods checks for logical sameness.

    Note that the isomorphism check ignores orphaned nodes, since those are
    logically deleted.
     */
    fn is_isomorphic_to(&self, other: &Self) -> bool;
}

impl<T> TreeIsomorphism<T> for Tree<T>
where
    T: Eq,
{
    fn is_isomorphic_to(&self, other: &Self) -> bool {
        self.root()
            .traverse()
            .zip_longest(other.root().traverse())
            .all(|pair| match pair {
                Both(Edge::Open(n1), Edge::Open(n2)) | Both(Edge::Close(n1), Edge::Close(n2)) => {
                    n1.value() == n2.value()
                }
                _ => false,
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ego_tree::tree;

    #[test]
    fn dfs() {
        let tree = tree!('a' => { 'b' => { 'd', 'e' }, 'c' });
        let values: Vec<_> = tree.root().dfs().map(|node| *node.value()).collect();
        assert_eq!(values, vec!['a', 'b', 'd', 'e', 'c']);
    }

    #[test]
    fn bfs() {
        let tree = tree!('a' => { 'b' => { 'd', 'e' }, 'c' });
        let values: Vec<_> = tree.root().bfs().map(|node| *node.value()).collect();
        assert_eq!(values, vec!['a', 'b', 'c', 'd', 'e']);

        let tree = tree!('a' => { 'b' => {'d'}, 'c' => {'e'} });
        let root = tree.root();
        let mut traverse = root.bfs();
        traverse.next();
        assert!(traverse.peek_at_same_level().is_none());
        assert_eq!(traverse.nth(2).map(|node| *node.value()), Some('d'));
        assert_eq!(traverse.peek_at_same_level().map(|node| *node.value()), Some('e'));
    }

    #[test]
    fn isomorphism() {
        let tree = tree!('a' => { 'b' => { 'd', 'e' }, 'c' });
        assert!(tree.is_isomorphic_to(&tree));

        let other = tree!('a' => { 'b' => { 'd' }, 'e' => { 'c' }});
        let tree_dfs_values: Vec<_> = tree.root().dfs().map(|node| *node.value()).collect();
        let other_dfs_values: Vec<_> = other.root().dfs().map(|node| *node.value()).collect();
        assert_eq!(tree_dfs_values, other_dfs_values);
        assert!(!tree.is_isomorphic_to(&other));
    }
}

#[cfg(test)]
pub(crate) mod proptesting {
    use super::*;
    use core::fmt::Debug;
    use proptest::prelude::{Strategy, prop_assert, prop_assert_eq, proptest};

    pub(crate) fn tree_strategy<'a, T: Debug + Clone + 'static>(
        desired_size: impl Strategy<Value = u8> + 'a,
        t_strategy: impl Strategy<Value = T> + Clone + 'static,
        depth: impl Strategy<Value = u8> + 'a,
        arities: impl Strategy<Value = u8> + Clone + 'a,
    ) -> impl Strategy<Value = Tree<T>> + 'a {
        (desired_size, depth, arities).prop_flat_map(
            move |(mut desired_size, depth, mut expected_branch_size)| {
                if expected_branch_size < 1 {
                    expected_branch_size = 1;
                }
                if desired_size == 0 {
                    desired_size = 1;
                }
                let t_strat = t_strategy.clone();
                t_strat.clone().prop_map(|root| Tree::new(root)).prop_recursive(
                    depth as u32,
                    desired_size as u32,
                    expected_branch_size as u32,
                    move |subtree_strat| {
                        (
                            t_strat.clone(),
                            proptest::collection::vec(
                                subtree_strat,
                                1..=(expected_branch_size as usize),
                            ),
                        )
                            .prop_map(|(root, children)| {
                                let mut new_tree = Tree::new(root);
                                for cur_child in children {
                                    let _ = new_tree.root_mut().append_subtree(cur_child);
                                }
                                new_tree
                            })
                    },
                )
            },
        )
    }

    proptest! {
        #[test]
        fn self_iso(t in tree_strategy::<i8>(0..10u8,-109i8..116,0u8..6,0u8..4), shift_amount in -104i8..104) {
            prop_assert!(t.is_isomorphic_to(&t));
            let t_prime = t.clone().map(|data| {data.checked_add(shift_amount).unwrap_or_default()});
            if shift_amount == 0 {
                prop_assert!(t_prime.is_isomorphic_to(&t));
            } else {
                prop_assert!(!t_prime.is_isomorphic_to(&t));
            }
        }

        #[test]
        fn arities_depth(t in tree_strategy::<char>(4..10u8,proptest::char::any(),0u8..6,1u8..4)) {
            #[allow(unused_variables)]
            let mut count_nodes = 0;
            for node in t.nodes() {
                count_nodes += 1;
                prop_assert!(node.children().count() < 4);
                let mut my_depth = 0;
                let mut cur_parent = node.clone();
                while let Some(cur_node) = cur_parent.parent() {
                    cur_parent = cur_node;
                    my_depth += 1;
                }
                prop_assert!(my_depth < 6);
            }
        }

        #[test]
        fn traversals_get_all(tree in tree_strategy::<char>(4..10u8,proptest::char::any(),0u8..6,0u8..4)) {
            let mut desired : Vec<char> = tree.nodes().map(|z| z.value()).copied().collect();
            desired.sort_unstable();
            let mut values: Vec<_> = tree.root().dfs().map(|node| *node.value()).collect();
            values.sort_unstable();
            prop_assert_eq!(desired.clone(), values);
            let mut values: Vec<_> = tree.root().bfs().map(|node| *node.value()).collect();
            values.sort_unstable();
            prop_assert_eq!(desired, values);
        }

        #[test]
        fn linear_tree(tree in tree_strategy::<char>(4..10u8,proptest::char::any(),0u8..6,1u8..=1)) {
            let desired : Vec<char> = tree.nodes().map(|z| z.value()).copied().collect();
            let values: Vec<_> = tree.root().dfs().map(|node| *node.value()).collect();
            prop_assert_eq!(desired.clone(), values);
            let values: Vec<_> = tree.root().bfs().map(|node| *node.value()).collect();
            prop_assert_eq!(desired.clone(), values);
            let left_following : Vec<_> = tree.root().left_boundary().map(|node| *node.value()).collect();
            prop_assert_eq!(desired.clone(), left_following);
            let right_following : Vec<_> = tree.root().right_boundary().map(|node| *node.value()).collect();
            prop_assert_eq!(desired, right_following);
        }
    }
}
