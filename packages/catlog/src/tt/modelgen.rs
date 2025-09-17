/*! Generate catlog models from doublett types. */

use crate::dbl::model::DiscreteDblModel;
use crate::dbl::model::MutDblModel;
use crate::tt::toplevel::Toplevel;
use crate::tt::{eval::*, prelude::*, val::*};
use crate::zero::QualifiedName;

/** Generate a discrete double model from a type.

Precondition: `ty` must be valid in the empty context. */
pub fn generate(toplevel: &Toplevel, ty: &TyV) -> DiscreteDblModel {
    let eval = Evaluator::new(toplevel, Env::Nil, 0);
    let (elt, eval) = eval.bind_neu(text_seg("self"), ty.clone());
    let elt = eval.eta_neu(&elt, ty);
    let mut out = DiscreteDblModel::new(toplevel.theory.clone());
    extract_to(&eval, &mut out, vec![], &elt, ty);
    out
}

// val must be an eta-expanded element of an object type
fn name_of(val: &TmV) -> QualifiedName {
    let mut out = Vec::new();
    let mut n = val.as_neu();
    while let TmN_::Proj(n1, f) = &*n.clone() {
        n = n1.clone();
        out.push(*f);
    }
    out.reverse();
    out.into()
}

fn extract_to(
    eval: &Evaluator,
    out: &mut DiscreteDblModel,
    prefix: Vec<NameSegment>,
    val: &TmV,
    ty: &TyV,
) {
    match &**ty {
        TyV_::Object(ot) => out.add_ob(prefix.into(), ot.clone()),
        TyV_::Morphism(mt, dom, cod) => {
            out.add_mor(prefix.into(), name_of(dom), name_of(cod), mt.0.clone())
        }
        TyV_::Record(r) => {
            for (name, _) in r.fields1.iter() {
                let mut prefix = prefix.clone();
                prefix.push(*name);
                extract_to(
                    eval,
                    out,
                    prefix,
                    &eval.proj(val, *name),
                    &eval.field_ty(ty, val, *name),
                )
            }
        }
        TyV_::Sing(ty_v, tm_v) => {}
        TyV_::Unit => {}
    }
}
