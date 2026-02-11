//! Undirected wiring diagrams (UWDs).

use derivative::Derivative;
use std::{fmt, hash::Hash};

use crate::tt::util::{Row, pretty::*};
use crate::zero::{HashColumn, LabelSegment, Mapping, MutMapping, NameSegment};

/// Ports of a wiring diagram.
///
/// Each port consists of a name, a human-readable label, and a type (an
/// instance of Rust type `T`).
pub type Ports<T> = Row<T>;

/// Ports together with a mapping to junctions.
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
struct PortMap<T, J> {
    ports: Ports<T>,
    mapping: HashColumn<NameSegment, J>,
}

impl<T, J> PortMap<T, J> {
    fn new(ports: Ports<T>) -> Self {
        Self { ports, mapping: Default::default() }
    }
}

/// An undirected wiring diagram (UWD).
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
pub struct UWD<T, J> {
    outer: PortMap<T, J>,
    inner: Row<PortMap<T, J>>,
    junctions: HashColumn<J, T>,
}

impl<T, J> UWD<T, J> {
    /// Constructs a UWD with the given outer interface.
    pub fn new(outer_ports: Ports<T>) -> Self {
        Self {
            outer: PortMap::new(outer_ports),
            inner: Default::default(),
            junctions: Default::default(),
        }
    }

    /// Adds an inner box with the given interface.
    pub fn add_box(&mut self, name: NameSegment, label: LabelSegment, ports: Ports<T>) {
        self.inner.insert(name, label, PortMap::new(ports));
    }
}

impl<T: Clone + Eq, J: Clone + Eq + Hash> UWD<T, J> {
    /// Assigns a port on a box to a junction.
    pub fn set_inner(&mut self, box_: NameSegment, port: NameSegment, junction: J) {
        let inner = self.inner.get_mut(box_).unwrap_or_else(|| panic!("No box named {box_}"));
        let ty = inner
            .ports
            .get(port)
            .unwrap_or_else(|| panic!("Box {box_} has no port named {port}"));
        if !self.junctions.is_set(&junction) {
            self.junctions.set(junction.clone(), ty.clone());
        }
        inner.mapping.set(port, junction);
    }

    /// Assigns an outer port to a junction.
    pub fn set_outer(&mut self, port: NameSegment, junction: J) {
        let ty = self
            .outer
            .ports
            .get(port)
            .unwrap_or_else(|| panic!("No outer port named {port}"));
        if !self.junctions.is_set(&junction) {
            self.junctions.set(junction.clone(), ty.clone());
        }
        self.outer.mapping.set(port, junction);
    }
}

/// Pretty prints a port-to-junction map in the style of a Datalog clause.
impl<T: fmt::Display, J: fmt::Display + Clone + Eq> ToDoc for PortMap<T, J> {
    fn to_doc<'a>(&self) -> D<'a> {
        let args = self.ports.iter().map(|(port_name, (label, ty))| {
            let arg = binop(t(":"), t(label.to_string()), t(ty.to_string()));
            let var = match self.mapping.get(port_name) {
                Some(junction) => t(junction.to_string()),
                None => t("_"),
            };
            binop(t(":="), arg, var)
        });
        tuple(args)
    }
}

/// Pretty prints a UWD in the style of a Datalog query.
///
/// Unlike in typical Datalog syntax, arguments are named and typed.
impl<T: fmt::Display, J: fmt::Display + Clone + Eq + Hash> ToDoc for UWD<T, J> {
    fn to_doc<'a>(&self) -> D<'a> {
        let head = self.outer.to_doc();
        let clauses = self
            .inner
            .iter()
            .map(|(_, (label, port_map))| unop(t(label.to_string()), port_map.to_doc()));
        let body = intersperse(clauses, t(",") + s());
        head + t(" :-") + (s() + body).indented()
    }
}

impl<T: fmt::Display, J: fmt::Display + Clone + Eq + Hash> fmt::Display for UWD<T, J> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_doc().pretty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use expect_test::expect;

    #[test]
    fn pretty_print() {
        let mut uwd: UWD<_, _> = UWD::new(Ports::from_iter([("x", "X"), ("z", "Z")]));
        uwd.add_box("R".into(), "R".into(), Ports::from_iter([("a", "X"), ("b", "Y")]));
        uwd.add_box("S".into(), "S".into(), Ports::from_iter([("c", "Y"), ("d", "Z")]));
        uwd.set_inner("R".into(), "a".into(), "u");
        uwd.set_inner("R".into(), "b".into(), "v");
        uwd.set_inner("S".into(), "c".into(), "v");
        uwd.set_inner("S".into(), "d".into(), "w");
        uwd.set_outer("x".into(), "u");
        uwd.set_outer("z".into(), "w");

        let expected = expect![[r#"
            [x : X := u, z : Z := w] :-
              R [a : X := u, b : Y := v],
              S [c : Y := v, d : Z := w]"#]];
        expected.assert_eq(&uwd.to_string());
    }
}
