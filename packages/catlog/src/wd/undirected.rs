//! Undirected wiring diagrams (UWDs).

use derivative::Derivative;
use std::hash::Hash;

use crate::tt::util::Row;
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
    pub fn set(&mut self, box_: NameSegment, port: NameSegment, junction: J) {
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
