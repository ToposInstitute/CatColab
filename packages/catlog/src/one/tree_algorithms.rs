//! Generic algorithms on [trees](Tree).

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
