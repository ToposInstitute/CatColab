//! Generate catlog models from doublett types.

use std::fmt;

use crate::dbl::model::DiscreteDblModel;
use crate::dbl::model::MutDblModel;
use crate::dbl::model::{DblModel, FgDblModel};
use crate::one::category::FgCategory;
use crate::tt::stx::MorphismType;
use crate::tt::toplevel::Toplevel;
use crate::tt::{eval::*, prelude::*, val::*};
use crate::zero::QualifiedLabel;
use crate::zero::QualifiedName;

/// Generate a discrete double model from a type.
///
/// Precondition: `ty` must be valid in the empty context.
pub fn generate(
    toplevel: &Toplevel,
    ty: &TyV,
) -> (DiscreteDblModel, HashMap<QualifiedName, QualifiedLabel>) {
    let eval = Evaluator::new(toplevel, Env::Nil, 0);
    let (elt, eval) = eval.bind_self(ty.clone());
    let elt = eval.eta_neu(&elt, ty);
    let mut out = DiscreteDblModel::new(toplevel.theory.clone());
    let mut name_translation = HashMap::new();
    extract_to(&eval, &mut out, &mut name_translation, vec![], vec![], &elt, ty);
    (out, name_translation)
}

// val must be an eta-expanded element of an object type
fn name_of(val: &TmV) -> QualifiedName {
    let mut out = Vec::new();
    let mut n = val.as_neu();
    while let TmN_::Proj(n1, f, _) = &*n.clone() {
        n = n1.clone();
        out.push(*f);
    }
    out.reverse();
    out.into()
}

fn extract_to(
    eval: &Evaluator,
    out: &mut DiscreteDblModel,
    name_translation: &mut HashMap<QualifiedName, QualifiedLabel>,
    prefix: Vec<NameSegment>,
    label_prefix: Vec<LabelSegment>,
    val: &TmV,
    ty: &TyV,
) {
    match &**ty {
        TyV_::Object(ot) => {
            out.add_ob(prefix.clone().into(), ot.clone());
            name_translation.insert(prefix.into(), label_prefix.into());
        }
        TyV_::Morphism(mt, dom, cod) => {
            out.add_mor(prefix.clone().into(), name_of(dom), name_of(cod), mt.0.clone());
            name_translation.insert(prefix.into(), label_prefix.into());
        }
        TyV_::Record(r) => {
            for (name, (label, _)) in r.fields1.iter() {
                let mut prefix = prefix.clone();
                prefix.push(*name);
                let mut label_prefix = label_prefix.clone();
                label_prefix.push(*label);
                extract_to(
                    eval,
                    out,
                    name_translation,
                    prefix,
                    label_prefix,
                    &eval.proj(val, *name, *label),
                    &eval.field_ty(ty, val, *name),
                )
            }
        }
        TyV_::Sing(_, _) => {}
        TyV_::Unit => {}
    }
}

/// Display model output nicely
pub fn model_output(
    prefix: &str,
    out: &mut impl fmt::Write,
    model: &DiscreteDblModel,
    name_translation: &HashMap<QualifiedName, QualifiedLabel>,
) -> fmt::Result {
    writeln!(out, "{prefix}object generators:")?;
    for obgen in model.ob_generators() {
        writeln!(
            out,
            "{prefix} {} : {}",
            name_translation.get(&obgen).unwrap(),
            model.ob_type(&obgen)
        )?;
    }
    writeln!(out, "{prefix}morphism generators:")?;
    for morgen in model.mor_generators() {
        writeln!(
            out,
            "{prefix} {} : {} -> {} ({})",
            name_translation.get(&morgen).unwrap(),
            name_translation.get(&model.mor_generator_dom(&morgen)).unwrap(),
            name_translation.get(&model.mor_generator_cod(&morgen)).unwrap(),
            MorphismType(model.mor_generator_type(&morgen))
        )?;
    }
    Ok(())
}
