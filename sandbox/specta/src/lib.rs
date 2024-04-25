use std::collections::HashMap;
use specta::Type;

pub trait Graph {
    type V;
    type E;
    // ...
}

#[derive(Type)]
pub struct ColGraph<V,E> {
    vertices: Vec<V>,
    edges: Vec<E>,
    src: HashMap<E,V>,
    tgt: HashMap<E,V>,
}

impl<V,E> Graph for ColGraph<V,E> {
    type V = V;
    type E = E;
    // ...
}

#[derive(Type)]
pub struct Path<V,E> {
    start: V,
    path: Vec<E>,
}
