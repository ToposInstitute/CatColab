//! Undirected wiring diagrams (UWDs).

use derivative::Derivative;
use std::{fmt, hash::Hash};

use crate::tt::util::{Row, pretty::*};
use crate::validate::{self, Validate};
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
    /// Constructs an empty UWD.
    pub fn empty() -> Self {
        Self::default()
    }

    /// Constructs a UWD with the given interface for its outer ports.
    pub fn with_ports(outer_ports: Ports<T>) -> Self {
        Self {
            outer: PortMap::new(outer_ports),
            inner: Default::default(),
            junctions: Default::default(),
        }
    }

    /// Adds an inner box with empty interface.
    pub fn add_box(&mut self, name: NameSegment, label: LabelSegment) {
        self.inner.insert(name, label, PortMap::default())
    }

    /// Adds an inner box with the given interface.
    pub fn add_box_with_ports(&mut self, name: NameSegment, label: LabelSegment, ports: Ports<T>) {
        self.inner.insert(name, label, PortMap::new(ports));
    }

    /// Adds a port to a box.
    pub fn add_port(
        &mut self,
        box_name: NameSegment,
        port_name: NameSegment,
        label: LabelSegment,
        ty: T,
    ) -> Option<()> {
        let inner = self.inner.get_mut(box_name)?;
        inner.ports.insert(port_name, label, ty);
        Some(())
    }
}

impl<T: Clone + Eq, J: Clone + Eq + Hash> UWD<T, J> {
    /// Assigns a port on a box to a junction.
    pub fn set(
        &mut self,
        box_name: NameSegment,
        port_name: NameSegment,
        junction: J,
    ) -> Option<()> {
        let inner = self.inner.get_mut(box_name)?;
        let ty = inner.ports.get(port_name)?;
        if !self.junctions.is_set(&junction) {
            self.junctions.set(junction.clone(), ty.clone());
        }
        inner.mapping.set(port_name, junction);
        Some(())
    }

    /// Assigns an outer port to a junction.
    pub fn set_outer(&mut self, port_name: NameSegment, junction: J) -> Option<()> {
        let ty = self.outer.ports.get(port_name)?;
        if !self.junctions.is_set(&junction) {
            self.junctions.set(junction.clone(), ty.clone());
        }
        self.outer.mapping.set(port_name, junction);
        Some(())
    }
}

/// A failure of a UWD to be valid/well-typed.
pub enum InvalidUWD {
    /// Outer port is not assigned or assigned to a junction with wrong type.
    OuterPortType {
        /// Name of the offending port.
        port_name: NameSegment,
    },
    /// Port of box is not assigned or assigned to a junction with wrong type.
    InnerPortType {
        /// Name of the box containing the offending port.
        box_name: NameSegment,
        /// Name of the offending port.
        port_name: NameSegment,
    },
}

impl<T: Clone + Eq, J: Clone + Eq + Hash> UWD<T, J> {
    fn iter_invalid(&self) -> impl Iterator<Item = InvalidUWD> + use<'_, T, J> {
        let junctions = &self.junctions;
        let outer_errors = self.outer.ports.iter().filter_map(|(&port_name, (_, ty))| {
            let valid = self
                .outer
                .mapping
                .get(&port_name)
                .is_some_and(|j| junctions.get(j).is_some_and(|jty| jty == ty));
            (!valid).then_some(InvalidUWD::OuterPortType { port_name })
        });
        let inner_errors = self.inner.iter().flat_map(move |(&box_name, (_, port_map))| {
            port_map.ports.iter().filter_map(move |(&port_name, (_, ty))| {
                let valid = port_map
                    .mapping
                    .get(&port_name)
                    .is_some_and(|j| junctions.get(j).is_some_and(|jty| jty == ty));
                (!valid).then_some(InvalidUWD::InnerPortType { box_name, port_name })
            })
        });
        outer_errors.chain(inner_errors)
    }
}

impl<T: Clone + Eq, J: Clone + Eq + Hash> Validate for UWD<T, J> {
    type ValidationError = InvalidUWD;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
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

    fn binary_composite_uwd() -> UWD<&'static str, &'static str> {
        let mut uwd: UWD<_, _> = UWD::with_ports(Ports::from_iter([("x", "X"), ("z", "Z")]));
        uwd.add_box_with_ports("R".into(), "R".into(), Ports::from_iter([("a", "X"), ("b", "Y")]));
        uwd.add_box_with_ports("S".into(), "S".into(), Ports::from_iter([("c", "Y"), ("d", "Z")]));
        uwd.set("R".into(), "a".into(), "u");
        uwd.set("R".into(), "b".into(), "v");
        uwd.set("S".into(), "c".into(), "v");
        uwd.set("S".into(), "d".into(), "w");
        uwd.set_outer("x".into(), "u");
        uwd.set_outer("z".into(), "w");
        uwd
    }

    #[test]
    fn pretty_print() {
        let uwd = binary_composite_uwd();
        let expected = expect![[r#"
            [x : X := u, z : Z := w] :-
              R [a : X := u, b : Y := v],
              S [c : Y := v, d : Z := w]"#]];
        expected.assert_eq(&uwd.to_string());
    }

    #[test]
    fn validate() {
        assert!(binary_composite_uwd().validate().is_ok());
    }
}
