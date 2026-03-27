//! Extraction of [`SchemaInfo`] from models of modal theories of schemas.

use std::rc::Rc;

use std::collections::HashMap;

use crate::{
    dbl::modal::theory::{ModalDblTheory, ModalObType, Modality},
    dbl::model::*,
    dbl::theory::{DblTheory as _, NonUnital},
    one::{
        graph::{ColumnarGraph, Graph, HashGraph},
        graph_algorithms::toposort,
    },
    zero::{FinSet, QualifiedLabel, QualifiedName, label},
};

use super::ir::*;

/// Extracts a [`SchemaInfo`] from a model of a modal theory of database schemas.
///
/// The `table_ob_type` parameter specifies which object type represents tables
/// (e.g., `ModeApp::new(name("Entity"))`).
///
/// Column kind is determined generically from the theory's type structure:
/// - **FK vs attribute**: a pro-arrow whose codomain ob type (up to leading
///   `Maybe`) is `table_ob_type` is a foreign key; otherwise it's an attribute.
/// - **Nullability**: a morphism whose target ob type has an outermost `Maybe`
///   modality is a nullable column.
pub fn schema_info_from_modal(
    model: &ModalDblModel<NonUnital>,
    table_ob_type: &ModalObType,
    ob_label: impl Fn(&QualifiedName) -> QualifiedLabel,
    mor_label: impl Fn(&QualifiedName) -> QualifiedLabel,
) -> Result<SchemaInfo, String> {
    let theory = model.theory();

    let entities: Vec<QualifiedName> = model.ob_generators_with_type(table_ob_type).collect();
    let entity_mors = collect_entity_mors(model, &entities);

    let dep_graph = build_fk_dep_graph(&entity_mors, model, &theory, &entities, table_ob_type);
    let sorted = toposort(&dep_graph).map_err(|e| format!("Topological sort failed: {e}"))?;

    let tables = sorted
        .iter()
        .map(|entity| {
            let mors = entity_mors.get(entity).map(|v| v.as_slice()).unwrap_or_default();
            let columns = mors
                .iter()
                .map(|mor| build_column(mor, &theory, model, table_ob_type, &ob_label, &mor_label))
                .collect();
            TableInfo { name: ob_label(entity), columns }
        })
        .collect();

    Ok(SchemaInfo { tables })
}

/// Collects the outgoing morphism generators for each entity.
///
/// The modal model's computad has `ModalOb` vertices, a recursive type that
/// includes modality applications like `Maybe(...)`, so its vertex set is not
/// finitely enumerable and it does not implement `FinGraph`. We work around
/// this by filtering the edge set directly rather than using an indexed
/// out-edge lookup.
fn collect_entity_mors(
    model: &ModalDblModel<NonUnital>,
    entities: &[QualifiedName],
) -> HashMap<QualifiedName, Vec<QualifiedName>> {
    let computad = model.computad();
    let mut entity_mors: HashMap<QualifiedName, Vec<QualifiedName>> =
        HashMap::from_iter(entities.iter().map(|e| (e.clone(), Vec::new())));

    for mor in computad.edge_set().iter() {
        if let ModalOb::Generator(src_name) = computad.src(&mor)
            && let Some(mors) = entity_mors.get_mut(&src_name)
        {
            mors.push(mor);
        }
    }

    entity_mors
}

/// Builds a dependency graph among entities for topological sorting.
fn build_fk_dep_graph(
    entity_mors: &HashMap<QualifiedName, Vec<QualifiedName>>,
    model: &ModalDblModel<NonUnital>,
    theory: &Rc<ModalDblTheory<NonUnital>>,
    entities: &[QualifiedName],
    table_ob_type: &ModalObType,
) -> HashGraph<QualifiedName, QualifiedName> {
    let mut graph: HashGraph<QualifiedName, QualifiedName> = Default::default();
    for entity in entities {
        graph.add_vertex(entity.clone());
    }

    for (src, mors) in entity_mors {
        for mor in mors {
            let tgt_ob_type = theory.tgt_type(&model.mor_generator_type(mor));
            if !is_fk_ob_type(&tgt_ob_type, table_ob_type) {
                continue;
            }
            if let Some(tgt_name) = cod_generator_name(model, mor)
                && graph.has_vertex(&tgt_name)
            {
                // Note the reversal: tgt_name must come before src.
                graph.add_edge(mor.clone(), tgt_name, src.clone());
            }
        }
    }

    graph
}

/// Builds a [`ColumnInfo`] for a single morphism generator.
fn build_column(
    mor: &QualifiedName,
    theory: &Rc<ModalDblTheory<NonUnital>>,
    model: &ModalDblModel<NonUnital>,
    table_ob_type: &ModalObType,
    ob_label: &impl Fn(&QualifiedName) -> QualifiedLabel,
    mor_label: &impl Fn(&QualifiedName) -> QualifiedLabel,
) -> ColumnInfo {
    let col_name = mor_label(mor);
    let mor_type = model.mor_generator_type(mor);
    let tgt_ob_type = theory.tgt_type(&mor_type);
    let nullable = tgt_ob_type.modalities.last() == Some(&Modality::Maybe());

    let cod_label = cod_generator_name(model, mor)
        .map(|name| ob_label(&name))
        .unwrap_or_else(|| label(""));

    if is_fk_ob_type(&tgt_ob_type, table_ob_type) {
        ColumnInfo::ForeignKey {
            name: col_name,
            target_table: cod_label,
            nullable,
        }
    } else {
        ColumnInfo::Attribute {
            name: col_name,
            data_type: cod_label,
            nullable,
        }
    }
}

/// Gets the generator name of a morphism's codomain, stripping `Maybe` if present.
fn cod_generator_name(
    model: &ModalDblModel<NonUnital>,
    mor: &QualifiedName,
) -> Option<QualifiedName> {
    model.get_cod(mor).and_then(|ob| as_generator_through_maybe(ob.clone()))
}

/// Extracts the generator name, stripping an outer `Maybe` if present.
fn as_generator_through_maybe(ob: ModalOb) -> Option<QualifiedName> {
    match ob {
        ModalOb::Generator(name) => Some(name),
        ModalOb::Maybe(inner) => {
            if let ModalOb::Generator(name) = *inner {
                Some(name)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Is the tgt_ob_type (up to leading Maybe) the same as table_ob_type?
fn is_fk_ob_type(tgt_ob_type: &ModalObType, table_ob_type: &ModalObType) -> bool {
    if tgt_ob_type.modalities.last() == Some(&Modality::Maybe()) {
        let mut stripped = tgt_ob_type.clone();
        stripped.modalities.pop();
        &stripped == table_ob_type
    } else {
        tgt_ob_type == table_ob_type
    }
}
