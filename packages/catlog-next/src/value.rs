use serde::{Deserialize, Serialize};
use std::{collections::HashMap, rc::Rc};
use tsify::Tsify;
use uuid::Uuid;

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Value {
    Empty,
    Uuid(Uuid),
    Text(String),
    Record(HashMap<String, Value>),
    List(Vec<Value>),
    Tagged(String, Box<Value>),
}

#[derive(Clone)]
pub enum ValuePos {
    Here,
    Record { field: String, rest: Rc<ValuePos> },
    List { idx: usize, rest: Rc<ValuePos> },
    Tagged { tag: String, rest: Rc<ValuePos> },
}

impl Value {
    fn get(&self, pos: &ValuePos) -> Option<&Value> {
        match (self, pos) {
            (_, ValuePos::Here) => Some(self),
            (Value::Record(r), ValuePos::Record { field, rest }) => {
                r.get(&*field).and_then(|v| v.get(rest))
            }
            (Value::List(l), ValuePos::List { idx, rest }) => l.get(*idx).and_then(|v| v.get(rest)),
            (Value::Tagged(t, v), ValuePos::Tagged { tag, rest }) => {
                if t == tag {
                    v.get(rest)
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    fn as_str(&self) -> Option<&str> {
        match self {
            Value::Text(s) => Some(&*s),
            _ => None,
        }
    }

    fn as_uuid(&self) -> Option<Uuid> {
        match self {
            Value::Uuid(u) => Some(*u),
            _ => None,
        }
    }
}
