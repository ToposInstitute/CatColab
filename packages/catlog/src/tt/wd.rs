//! Extract wiring diagrams from record types.

use super::{eval::*, theory::*, toplevel::*, util::*, val::*};
use crate::wd::UWD;
use crate::zero::QualifiedName;

/// Extracts an undirected wiring diagram from a record type.
///
/// Returns a UWD when the given type is a record; otherwise, returns `None`.
/// The UWD has a box for each field that is itself of record type.
///
/// Because record types do not have an explicit notion of interface (say by
/// distinguishing "public" and "private" fields), there is ambiguity about how
/// to choose the interfaces (ports) for outer and inner boxes. Two approaches
/// are reasonable. In the maximalist approach, *every* field of `Object` type
/// contributes a port. In the minimalist approach, only those fields used in a
/// specialization contribute a port. We take the minimalist approach because
/// the purpose of this feature is to get a visual overview of a composition,
/// which is best achieved by minimizing clutter.
///
/// A deeper problem is that specializations of a nested record type can refer
/// to fields of arbitrary depth. In this function, any specializations more
/// than one level deep are ignored. To capture these, one might look for a
/// "nested UWD" data structure.
pub fn record_to_uwd(ty: &TyV) -> Option<UWD<ObType, QualifiedName>> {
    let TyV_::Record(record_v) = &**ty else {
        return None;
    };

    let toplevel = Toplevel::default();
    let eval = Evaluator::empty(&toplevel);
    let (tm_n, eval) = eval.bind_self(ty.clone());
    let tm_v = eval.eta_neu(&tm_n, ty);

    let mut uwd = UWD::empty();

    // First pass: add a box for each field that is itself of record type.
    for (field_name, (field_label, _)) in record_v.fields.iter() {
        let field_ty = eval.field_ty(ty, &tm_v, *field_name);
        let TyV_::Record(r) = &&*field_ty else {
            continue;
        };
        uwd.add_box(*field_name, *field_label);

        // Add a port to the box for each specialization of the record type.
        for (port_name, (port_label, entry)) in r.specializations.entries() {
            let DtryEntry::File(spec_type) = entry else {
                // Specialization is allowed at arbitrary depth, but only those at
                // depth one can be expressed in a UWD.
                continue;
            };
            let TyV_::Sing(ty, tm) = &**spec_type else {
                continue;
            };
            let (TyV_::Object(ob_type), TmV_::Neu(n, _)) = (&**ty, &**tm) else {
                continue;
            };
            let qual_name = n.to_qualified_name();
            uwd.add_port(*field_name, *port_name, *port_label, ob_type.clone());
            uwd.set(*field_name, *port_name, qual_name);
        }
    }

    // Second pass: add further ports corresponding to fields that now exist as
    // junctions, due to the first pass.
    for (field_name, (field_label, _)) in record_v.fields.iter() {
        let field_ty = eval.field_ty(ty, &tm_v, *field_name);
        match &&*field_ty {
            // Add outer port for each top-level field that is a junction.
            TyV_::Object(ob_type) => {
                let qual_name = QualifiedName::single(*field_name);
                if uwd.has_junction(&qual_name) {
                    uwd.add_outer_port(*field_name, *field_label, ob_type.clone());
                    uwd.set_outer(*field_name, qual_name);
                }
            }
            // Add port to box for each sub-field that is a junction.
            TyV_::Record(r) => {
                let tm_v = eval.proj(&tm_v, *field_name, *field_label);
                for (port_name, (port_label, _)) in r.fields.iter() {
                    if uwd.has_port(*field_name, *port_name) {
                        continue;
                    }
                    let qual_name: QualifiedName = [*field_name, *port_name].into();
                    if uwd.has_junction(&qual_name) {
                        let port_ty = eval.field_ty(&field_ty, &tm_v, *port_name);
                        let TyV_::Object(ob_type) = &*port_ty else {
                            continue;
                        };
                        uwd.add_port(*field_name, *port_name, *port_label, ob_type.clone());
                        uwd.set(*field_name, *port_name, qual_name);
                    }
                }
            }
            _ => {}
        }
    }

    Some(uwd)
}
