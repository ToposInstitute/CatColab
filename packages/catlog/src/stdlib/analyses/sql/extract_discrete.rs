//! Extraction of [`SchemaInfo`] from models of the discrete theory of schemas.

use crate::{
    dbl::model::*,
    one::{Path, graph::FinGraph, graph_algorithms::toposort},
    zero::{QualifiedLabel, QualifiedName, label, name},
};

use super::ir::*;

/// Extracts a [`SchemaInfo`] from a model of the discrete theory of schemas ([`th_schema`]).
///
/// In this theory, morphisms of type `Hom Entity` (represented as `Path::Id(name("Entity"))`)
/// are foreign keys, and all other morphisms are data attributes.
pub fn schema_info_from_discrete(
    model: &DiscreteDblModel,
    ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
) -> Result<SchemaInfo, String> {
    let g = model.generating_graph();
    let t = toposort(g).map_err(|e| format!("Topological sort failed: {}", e))?;

    let tables = t
        .iter()
        .rev()
        .filter(|v| name("Entity") == model.ob_generator_type(v))
        .map(|v| {
            let columns = g
                .out_edges(v)
                .map(|mor| {
                    let col_name = mor_label(&mor);
                    if model.mor_generator_type(&mor) == Path::Id(name("Entity")) {
                        let tgt = model.get_cod(&mor).map(&ob_label).unwrap_or_else(|| label(""));
                        ColumnInfo::ForeignKey {
                            name: col_name,
                            target_table: tgt,
                            nullable: false,
                        }
                    } else {
                        let tgt = model.get_cod(&mor).map(&ob_label).unwrap_or_else(|| label(""));
                        ColumnInfo::Attribute {
                            name: col_name,
                            data_type: tgt,
                            nullable: false,
                        }
                    }
                })
                .collect();
            TableInfo { name: ob_label(v), columns }
        })
        .collect();

    Ok(SchemaInfo { tables })
}
