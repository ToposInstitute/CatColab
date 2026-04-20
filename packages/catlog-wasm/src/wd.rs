//! Serialization of wiring diagrams.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::wd;
use catlog::zero::{LabelSegment, NameSegment, QualifiedName};

/// An undirected wiring diagram.
///
/// For now, junctions are assumed to be qualified names as that's all we need.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct UWD {
    /// Outer ports of diagram.
    #[serde(rename = "outerPorts")]
    pub outer_ports: Vec<UWDPort>,

    /// Boxes in diagram.
    pub boxes: Vec<UWDBox>,

    /// Junctions in diagram.
    pub junctions: Vec<QualifiedName>,
}

/// A box in an undirected wiring diagram.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct UWDBox {
    /// Identifier of box, unique within diagram.
    pub name: NameSegment,

    /// Human-readlable label for box.
    pub label: LabelSegment,

    /// Ports of box.
    pub ports: Vec<UWDPort>,
}

/// A port in an undirected wiring diagram.
///
/// The type of the port is omitted.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct UWDPort {
    /// Identifier of port, unique among an interface (list of ports).
    pub name: NameSegment,

    /// Human-readable label for port.
    pub label: LabelSegment,

    /// The junction that the port is assigned to, if any.
    pub junction: Option<QualifiedName>,
}

/// Serializes an undirected wiring diagram.
pub fn serialize_uwd<T: Clone + Eq>(uwd: &wd::UWD<T, QualifiedName>) -> UWD {
    let outer_ports = uwd
        .outer_ports()
        .iter()
        .map(|(&name, &(label, _))| UWDPort {
            name,
            label,
            junction: uwd.get_outer(name).cloned(),
        })
        .collect();

    let boxes = uwd
        .boxes()
        .map(|(&box_name, &box_label, ports)| UWDBox {
            name: box_name,
            label: box_label,
            ports: ports
                .iter()
                .map(|(&port_name, &(port_label, _))| UWDPort {
                    name: port_name,
                    label: port_label,
                    junction: uwd.get(box_name, port_name).cloned(),
                })
                .collect(),
        })
        .collect();

    let junctions = uwd.junctions().collect();

    UWD { outer_ports, boxes, junctions }
}
