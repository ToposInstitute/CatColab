//! Generate catlog models from doublett types.

use std::fmt;

use crate::dbl::model::DiscreteDblModel;
use crate::dbl::model::MutDblModel;
use crate::dbl::model::{DblModel, FgDblModel};
use crate::one::category::FgCategory;
use crate::tt::stx::MorphismType;
use crate::tt::{eval::*, prelude::*, toplevel::*, val::*};
use crate::zero::Namespace;
use crate::zero::QualifiedName;

/// Generate a discrete double model from a type.
///
/// Precondition: `ty` must be valid in the empty context.
pub fn generate(toplevel: &Toplevel, theory: &Theory, ty: &TyV) -> (DiscreteDblModel, Namespace) {
    let eval = Evaluator::new(toplevel, Env::Nil, 0);
    let (elt, eval) = eval.bind_self(ty.clone());
    let elt = eval.eta_neu(&elt, ty);
    let mut out = DiscreteDblModel::new(theory.definition.clone());
    let namespace =
        extract_to(&eval, &mut out, vec![], &elt, ty).unwrap_or_else(Namespace::new_for_uuid);
    (out, namespace)
}

// val must be an eta-expanded element of an object type
fn name_of(val: &TmV) -> Option<QualifiedName> {
    let mut out = Vec::new();
    let TmV::Neu(mut n, _) = val.clone() else {
        return None;
    };
    while let TmN_::Proj(n1, f, _) = &*n.clone() {
        n = n1.clone();
        out.push(*f);
    }
    out.reverse();
    Some(out.into())
}

fn extract_to(
    eval: &Evaluator,
    out: &mut DiscreteDblModel,
    prefix: Vec<NameSegment>,
    val: &TmV,
    ty: &TyV,
) -> Option<Namespace> {
    match &**ty {
        TyV_::Object(ot) => {
            out.add_ob(prefix.clone().into(), ot.clone());
            None
        }
        TyV_::Morphism(mt, dom, cod) => {
            out.add_mor(prefix.clone().into(), name_of(dom)?, name_of(cod)?, mt.0.clone());
            None
        }
        TyV_::Record(r) => {
            let mut namespace = Namespace::new_for_uuid();
            for (name, (label, _)) in r.fields.iter() {
                let mut prefix = prefix.clone();
                prefix.push(*name);
                match name {
                    NameSegment::Uuid(uuid) => {
                        namespace.set_label(*uuid, *label);
                    }
                    NameSegment::Text(_) => {}
                }
                if let Some(inner) = extract_to(
                    eval,
                    out,
                    prefix,
                    &eval.proj(val, *name, *label),
                    &eval.field_ty(ty, val, *name),
                ) {
                    namespace.add_inner(*name, inner);
                };
            }
            Some(namespace)
        }
        TyV_::Sing(_, _) => None,
        TyV_::Unit => None,
        TyV_::Meta(_) => None,
    }
}

/// Display model output nicely
pub fn model_output(
    prefix: &str,
    out: &mut impl fmt::Write,
    model: &DiscreteDblModel,
    name_translation: &Namespace,
) -> fmt::Result {
    writeln!(out, "{prefix}object generators:")?;
    for obgen in model.ob_generators() {
        writeln!(
            out,
            "{prefix}  {} : {}",
            name_translation.label(&obgen).unwrap(),
            model.ob_type(&obgen)
        )?;
    }
    writeln!(out, "{prefix}morphism generators:")?;
    for morgen in model.mor_generators() {
        writeln!(
            out,
            "{prefix}  {} : {} -> {} : {}",
            name_translation.label(&morgen).unwrap(),
            name_translation.label(&model.mor_generator_dom(&morgen)).unwrap(),
            name_translation.label(&model.mor_generator_cod(&morgen)).unwrap(),
            MorphismType(model.mor_generator_type(&morgen))
        )?;
    }
    Ok(())
}
