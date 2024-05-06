//! Paths in a graph or graph.

use nonempty::NonEmpty;

/** A path in a [graph](Graph) or [category](Category).

This definition by cases can be compared with the perhaps more obvious
definition:

```
struct Path<V, E> {
    start: V,
    end: V, // Optional: more symmetric but also more redundant.
    seq: Vec<E>,
}
```

Not only does the single struct store redundant (hence possibly inconsistent)
information when the sequence of edges is nonempty, one will often need to do a
case analysis on the edge sequence anyway to determine whether, say,
[`fold`](std::iter::Iterator::fold) can be called or the result of
[`reduce`](std::iter::Iterator::reduce) is valid. Thus, it seems better to reify
the two cases in the data structure itself.
*/
#[derive(Clone,Debug,PartialEq,Eq)]
pub enum Path<V,E> {
    /// The identity, or empty, path at a vertex.
    Id(V),

    /// A nontrivial path, comprising a *non-empty* vector of consecutive edges.
    Seq(NonEmpty<E>)
}
