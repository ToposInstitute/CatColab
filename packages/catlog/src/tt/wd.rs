//! Extract wiring diagrams from DoubleTT record types.

use super::{eval::*, theory::*, toplevel::*, util::*, val::*};
use crate::wd::UWD;
use crate::zero::QualifiedName;

/// Extracts a UWD from a record type.
///
/// Returns `None` when the given type is not a record.
pub fn record_to_uwd(ty: &TyV) -> Option<UWD<ObType, QualifiedName>> {
    let TyV_::Record(record_v) = &**ty else {
        return None;
    };

    let toplevel: Toplevel = Default::default();
    let eval = Evaluator::empty(&toplevel);
    let (tm_n, eval) = eval.bind_self(ty.clone());
    let tm_v = eval.eta_neu(&tm_n, ty);

    let mut uwd = UWD::empty();

    // First pass: add a box for each field whose type is itself a record type.
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

            // FIXME: Copied from `make_ob` in `modelgen`.
            let mut segments = Vec::new();
            let mut n = n;
            while let TmN_::Proj(n1, f, _) = &**n {
                n = n1;
                segments.push(*f);
            }
            segments.reverse();
            let qual_name = segments.into();

            uwd.add_port(*field_name, *port_name, *port_label, ob_type.clone());
            uwd.set(*field_name, *port_name, qual_name);
        }
    }

    // Second pass: add an outer port for each field that is now a junction.
    for (field_name, (field_label, _)) in record_v.fields.iter() {
        let qual_name = QualifiedName::single(*field_name);
        if !uwd.has_junction(&qual_name) {
            continue;
        }
        let field_ty = eval.field_ty(ty, &tm_v, *field_name);
        let TyV_::Object(ob_type) = &&*field_ty else {
            continue;
        };
        uwd.add_outer_port(*field_name, *field_label, ob_type.clone());
        uwd.set_outer(*field_name, qual_name);
    }

    Some(uwd)
}
