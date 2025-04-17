use serde::{Deserialize, Serialize};
use std::{collections::HashMap, rc::Rc};
use tsify::Tsify;
use uuid::Uuid;

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum WidgetState {
    Empty,
    Uuid(Uuid),
    Text(String),
    Record(HashMap<String, WidgetState>),
    List(Vec<WidgetState>),
    Tagged(String, Box<WidgetState>),
}

#[derive(Clone)]
pub enum WidgetStatePos {
    Here,
    Record { field: String, rest: Rc<WidgetStatePos> },
    List { idx: usize, rest: Rc<WidgetStatePos> },
    Tagged { tag: String, rest: Rc<WidgetStatePos> },
}

impl WidgetState {
    pub fn get(&self, pos: &WidgetStatePos) -> Option<&WidgetState> {
        match (self, pos) {
            (_, WidgetStatePos::Here) => Some(self),
            (WidgetState::Record(r), WidgetStatePos::Record { field, rest }) => {
                r.get(&*field).and_then(|v| v.get(rest))
            }
            (WidgetState::List(l), WidgetStatePos::List { idx, rest }) => l.get(*idx).and_then(|v| v.get(rest)),
            (WidgetState::Tagged(t, v), WidgetStatePos::Tagged { tag, rest }) => {
                if t == tag {
                    v.get(rest)
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            WidgetState::Text(s) => Some(&*s),
            _ => None,
        }
    }

    pub fn as_uuid(&self) -> Option<Uuid> {
        match self {
            WidgetState::Uuid(u) => Some(*u),
            _ => None,
        }
    }
}
