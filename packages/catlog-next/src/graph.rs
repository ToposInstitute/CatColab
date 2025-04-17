use std::collections::HashMap;
use uuid::Uuid;
use wasm_bindgen::prelude::*;

use crate::{notebook::Notebook, widget_state::WidgetState};

struct Vertex {
    name: String,
    type_: String,
}

struct Edge {
    name: String,
    type_: String,
    src: usize,
    tgt: usize,
}

pub struct Graph {
    vertices: Vec<Vertex>,
    edges: Vec<Edge>,
}

impl Graph {
    fn new() -> Self {
        Self {
            vertices: Vec::new(),
            edges: Vec::new(),
        }
    }

    fn add_vertex(&mut self, name: String, type_: String) -> usize {
        let i = self.vertices.len();
        self.vertices.push(Vertex { name, type_ });
        i
    }

    fn add_edge(&mut self, name: String, type_: String, src: usize, tgt: usize) -> usize {
        let i = self.edges.len();
        self.edges.push(Edge {
            name,
            type_,
            src,
            tgt,
        });
        i
    }
}

#[derive(Debug)]
pub enum Value {
    Edge(usize),
    Vertex(usize),
    Record(HashMap<Uuid, Value>),
}

impl Value {
    fn as_vertex(&self) -> usize {
        match self {
            Value::Vertex(i) => *i,
            _ => panic!("expected vertex"),
        }
    }
}

#[derive(Debug)]
pub enum GraphCell {
    Vertex {
        name: String,
        type_: String,
    },
    Edge {
        name: String,
        type_: String,
        src: Uuid,
        tgt: Uuid,
    },
}

fn eval_notebook(graph: &mut Graph, notebook: Vec<(Uuid, GraphCell)>) -> HashMap<Uuid, Value> {
    let mut values = HashMap::new();
    for (id, cell) in notebook.iter() {
        match cell {
            GraphCell::Vertex { name, type_ } => {
                values.insert(*id, Value::Vertex(graph.add_vertex(name.clone(), type_.clone())));
            }
            _ => {}
        }
    }
    for (id, cell) in notebook.iter() {
        match cell {
            GraphCell::Edge {
                name,
                type_,
                src,
                tgt,
            } => {
                let src_idx = values.get(src).unwrap().as_vertex();
                let tgt_idx = values.get(tgt).unwrap().as_vertex();
                values.insert(
                    *id,
                    Value::Edge(graph.add_edge(name.clone(), type_.clone(), src_idx, tgt_idx)),
                );
            }
            _ => {}
        }
    }
    values
}

pub fn elab_notebook(notebook: &Notebook) -> Option<Vec<(Uuid, GraphCell)>> {
    let mut cells = Vec::new();
    // let mut values = HashMap::new();
    let mut lookup = HashMap::new();
    for (id, cell) in notebook.cells.iter() {
        match &cell.content {
            WidgetState::Record(r) => {
                let name = r.get("name")?.as_str()?.to_string();
                lookup.insert(name, *id);
            }
            _ => {}
        }
    }
    for (id, cell) in notebook.cells.iter() {
        match &cell.content {
            WidgetState::Record(r) => {
                let name = r.get("name")?.as_str()?.to_string();
                match r.get("type")? {
                    WidgetState::Tagged(tag, tp) => match tag.as_str() {
                        "object" => match &**tp {
                            WidgetState::Text(tpname) => {
                                cells.push((
                                    *id,
                                    GraphCell::Vertex {
                                        name,
                                        type_: tpname.to_string(),
                                    },
                                ));
                            }
                            _ => return None,
                        },
                        "morphism" => match &**tp {
                            WidgetState::Record(m) => {
                                let tpname = m.get("type")?.as_str()?.to_string();
                                let src = m.get("dom")?.as_str()?;
                                let tgt = m.get("codom")?.as_str()?;
                                cells.push((
                                    *id,
                                    GraphCell::Edge {
                                        name,
                                        type_: tpname,
                                        src: *lookup.get(src)?,
                                        tgt: *lookup.get(tgt)?,
                                    },
                                ))
                            }
                            _ => {
                                return None;
                            }
                        },
                        _ => {
                            return None;
                        }
                    },
                    _ => {
                        return None;
                    }
                }
            }
            _ => {
                return None;
            }
        }
    }
    Some(cells)
}

#[wasm_bindgen]
pub fn debug_elab(notebook: &Notebook) {
    web_sys::console::log_1(&format!("{:?}", elab_notebook(notebook)).into());
}

#[wasm_bindgen]
pub fn debug_eval(notebook: &Notebook) {
    if let Some(cells) = elab_notebook(notebook) {
        let mut g = Graph::new();
        let v = eval_notebook(&mut g, cells);
        web_sys::console::log_1(&format!("{:?}", v).into());
    }
}
