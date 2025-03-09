//! Generic algorithms on [trees](Tree).

use std::collections::VecDeque;

use ego_tree::iter::Edge;
use ego_tree::{NodeRef, Tree};

/// Extension trait adding traversal algorithms on [trees](Tree).
pub trait TreeTraversal<T> {
    /// Iterates over nodes of a tree in depth-first order.
    fn dfs<'a>(&'a self) -> impl Iterator<Item = NodeRef<'a, T>>
    where
        T: 'a;

    /// Iterates over the nodes in a tree in breadth-first order.
    fn bfs<'a>(&'a self) -> impl Iterator<Item = NodeRef<'a, T>>
    where
        T: 'a;
}

/// Extension trait adding isomorphism checking on [trees](Tree).
pub trait TreeIsomorphism<T> {
    /** Is the tree isomorphic to another?

    In the standard data structure for trees based on pointers, there is only
    one notion of sameness that makes sense, but for vector-backed trees with
    node IDs, trees can be isomorphic (logically the same) without having
    underlying data that is equal.
     */
    fn is_isomorphic_to(&self, other: &Self) -> bool;
}

impl<T> TreeTraversal<T> for Tree<T> {
    /// Uses the built-in traversal algorithm, which is depth-first, though that
    /// is not documented: <https://github.com/rust-scraper/ego-tree/issues/38>
    fn dfs<'a>(&'a self) -> impl Iterator<Item = NodeRef<'a, T>>
    where
        T: 'a,
    {
        self.root().descendants()
    }

    /// Implements the standard BFS algorithm using a queue.
    fn bfs<'a>(&'a self) -> impl Iterator<Item = NodeRef<'a, T>>
    where
        T: 'a,
    {
        let mut queue = VecDeque::new();
        queue.push_back(self.root().id());
        std::iter::from_fn(move || {
            let id = queue.pop_front()?;
            let node = self.get(id).unwrap();
            for child in node.children() {
                queue.push_back(child.id());
            }
            Some(node)
        })
    }
}

impl<T> TreeIsomorphism<T> for Tree<T>
where
    T: Eq,
{
    fn is_isomorphic_to(&self, other: &Self) -> bool {
        let mut self_traversal = self.root().traverse();
        let mut other_traversal = other.root().traverse();
        loop {
            match (self_traversal.next(), other_traversal.next()) {
                (Some(Edge::Open(n1)), Some(Edge::Open(n2))) if n1.value() == n2.value() => {}
                (Some(Edge::Close(n1)), Some(Edge::Close(n2))) if n1.value() == n2.value() => {}
                (None, None) => {
                    break;
                }
                _ => {
                    return false;
                }
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ego_tree::tree;

    #[test]
    fn dfs() {
        let tree = tree!('a' => { 'b' => { 'd', 'e' }, 'c' });
        let values: Vec<_> = tree.dfs().map(|node| *node.value()).collect();
        assert_eq!(values, vec!['a', 'b', 'd', 'e', 'c']);
    }

    #[test]
    fn bfs() {
        let tree = tree!('a' => { 'b' => { 'd', 'e' }, 'c' });
        let values: Vec<_> = tree.bfs().map(|node| *node.value()).collect();
        assert_eq!(values, vec!['a', 'b', 'c', 'd', 'e']);
    }

    #[test]
    fn isomorphism() {
        let tree = tree!('a' => { 'b' => { 'd', 'e' }, 'c' });
        assert!(tree.is_isomorphic_to(&tree));

        let other = tree!('a' => { 'b' => { 'd' }, 'e' => { 'c' }});
        let tree_dfs_values: Vec<_> = tree.dfs().map(|node| *node.value()).collect();
        let other_dfs_values: Vec<_> = other.dfs().map(|node| *node.value()).collect();
        assert_eq!(tree_dfs_values, other_dfs_values);
        assert!(!tree.is_isomorphic_to(&other));
    }
}
