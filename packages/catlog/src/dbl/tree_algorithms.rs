//! Generic algorithms on trees.

use std::collections::VecDeque;

use ego_tree::{NodeRef, Tree};

/// Iterates over nodes in a tree in depth-first order.
pub fn dfs<T>(tree: &Tree<T>) -> impl Iterator<Item = NodeRef<'_, T>> {
    // The built-in traversal is in depth-first order, though this is not
    // explicitly documented: https://github.com/rust-scraper/ego-tree/issues/38
    tree.root().descendants()
}

/// Iterates over the nodes in a tree in breadth-first order.
pub fn bfs<T>(tree: &Tree<T>) -> impl Iterator<Item = NodeRef<'_, T>> {
    // The standard BFS algorithm using a queue.
    let mut queue = VecDeque::new();
    queue.push_back(tree.root().id());
    std::iter::from_fn(move || {
        let id = queue.pop_front()?;
        let node = tree.get(id).unwrap();
        for child in node.children() {
            queue.push_back(child.id());
        }
        Some(node)
    })
}

#[cfg(test)]
mod tests {
    use ego_tree::tree;

    #[test]
    fn dfs() {
        let tree = tree!('a' => { 'b' => { 'd', 'e' }, 'c' });
        let values: Vec<_> = super::dfs(&tree).map(|node| *node.value()).collect();
        assert_eq!(values, vec!['a', 'b', 'd', 'e', 'c']);
    }

    #[test]
    fn bfs() {
        let tree = tree!('a' => { 'b' => { 'd', 'e' }, 'c' });
        let values: Vec<_> = super::bfs(&tree).map(|node| *node.value()).collect();
        assert_eq!(values, vec!['a', 'b', 'c', 'd', 'e']);
    }
}
