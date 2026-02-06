//! Elaboration for frontend notebooks.
//!
//! The notebook elaborator is disjoint from the [text
//! elaborator](super::text_elab). One reason for this is that error reporting
//! must be completely different to be well adapted to the notebook interface.
//! As a first pass, we are associating cell UUIDs with errors.

use std::str::FromStr;
use uuid::Uuid;

use notebook_types::current as nb;

use super::{context::*, eval::*, prelude::*, stx::*, theory::*, toplevel::*, val::*};
use crate::dbl::model::{Feature, InvalidDblModel};
use crate::zero::QualifiedName;

/// The current state of a notebook elaboration session.
///
/// We feed a notebook into this cell-by-cell.
pub struct Elaborator<'a> {
    theory: Theory,
    toplevel: &'a Toplevel,
    ctx: Context,
    errors: Vec<InvalidDblModel>,
    ref_id: Ustr,
    next_meta: usize,
}

struct ElaboratorCheckpoint {
    ctx: ContextCheckpoint,
}

impl<'a> Elaborator<'a> {
    /// Create a new notebook elaborator.
    pub fn new(theory: Theory, toplevel: &'a Toplevel, ref_id: Ustr) -> Self {
        Self {
            theory,
            toplevel,
            ctx: Context::new(),
            errors: Vec::new(),
            ref_id,
            next_meta: 0,
        }
    }

    fn theory(&self) -> &TheoryDef {
        &self.theory.definition
    }

    /// Get all of the errors from elaboration.
    pub fn errors(&self) -> &[InvalidDblModel] {
        &self.errors
    }

    fn checkpoint(&self) -> ElaboratorCheckpoint {
        ElaboratorCheckpoint { ctx: self.ctx.checkpoint() }
    }

    fn reset_to(&mut self, c: ElaboratorCheckpoint) {
        self.ctx.reset_to(c.ctx);
    }

    fn evaluator(&self) -> Evaluator<'a> {
        Evaluator::new(self.toplevel, self.ctx.env.clone(), self.ctx.scope.len())
    }

    fn intro(&mut self, name: VarName, label: LabelSegment, ty: Option<TyV>) -> TmV {
        let v = TmV::neu(
            TmN::var(self.ctx.scope.len().into(), name, label),
            ty.clone().unwrap_or(TyV::unit()),
        );
        let v = if ty.is_some() {
            self.evaluator().eta(&v, ty.as_ref())
        } else {
            v
        };
        self.ctx.env = self.ctx.env.snoc(v.clone());
        self.ctx.scope.push(VarInContext::new(name, label, ty));
        v
    }

    fn fresh_meta(&mut self) -> MetaVar {
        let i = self.next_meta;
        self.next_meta += 1;
        MetaVar::new(Some(self.ref_id), i)
    }

    fn ty_error(&mut self, error: InvalidDblModel) -> (TyS, TyV) {
        self.errors.push(error);
        let ty_m = self.fresh_meta();
        (TyS::meta(ty_m), TyV::meta(ty_m))
    }

    fn ob_type(&mut self, ob_type: &nb::ObType) -> Option<ObType> {
        match &ob_type {
            nb::ObType::Basic(name) => self.theory().basic_ob_type((*name).into()),
            nb::ObType::Tabulator(_) => None,
            nb::ObType::ModeApp { .. } => None,
        }
    }

    fn object_cell(&mut self, ob_decl: &nb::ObDecl) -> (NameSegment, LabelSegment, TyS, TyV) {
        let name = NameSegment::Uuid(ob_decl.id);
        let label = LabelSegment::Text(ustr(&ob_decl.name));
        let (ty_s, ty_v) = match self.ob_type(&ob_decl.ob_type) {
            Some(ob_type) => (TyS::object(ob_type.clone()), TyV::object(ob_type)),
            None => self.ty_error(InvalidDblModel::ObType(QualifiedName::single(name))),
        };
        (name, label, ty_s, ty_v)
    }

    fn lookup_tm(&self, name: VarName) -> Option<(TmS, TmV, TyV)> {
        let (i, label, ty) = self.ctx.lookup(name)?;
        let v = self.ctx.env.get(*i).unwrap().clone();
        Some((TmS::var(i, name, label), v, ty.clone().unwrap()))
    }

    fn resolve_name(&self, segments: &[VarName]) -> Option<(TmS, TmV, TyV)> {
        let (&last, rest) = segments.split_last()?;
        if rest.is_empty() {
            self.lookup_tm(last)
        } else {
            let (tm_s, tm_v, ty_v) = self.resolve_name(rest)?;
            let TyV_::Record(r) = &*ty_v else {
                return None;
            };
            let &(label, _) = r.fields.get_with_label(last)?;
            Some((
                TmS::proj(tm_s, last, label),
                self.evaluator().proj(&tm_v, last, label),
                self.evaluator().field_ty(&ty_v, &tm_v, last),
            ))
        }
    }

    fn ob(&mut self, n: &nb::Ob) -> Option<(TmS, TmV, ObType)> {
        match n {
            nb::Ob::Basic(name) => {
                let name = QualifiedName::deserialize_str(name).unwrap();
                let (stx, val, ty) = self.resolve_name(name.as_slice())?;
                let TyV_::Object(ob_type) = &*ty else {
                    return None;
                };
                Some((stx, val, ob_type.clone()))
            }
            nb::Ob::App { op: nb::ObOp::Basic(name), ob } => {
                let name = name_seg(*name);
                let ob_op = self.theory().basic_ob_op([name].into())?;

                let (arg_stx, arg_val, arg_type) = self.ob(ob)?;
                if arg_type != self.theory().ob_op_dom(&ob_op) {
                    // FIXME: We should report a type error here, but how?
                    return None;
                }
                let stx = TmS::ob_app(name, arg_stx);
                let val = TmV::app(name, arg_val);
                Some((stx, val, self.theory().ob_op_cod(&ob_op)))
            }
            nb::Ob::List { .. } => None,
            nb::Ob::Tabulated(_) => None,
        }
    }

    fn morphism_cell_ty(&mut self, mor_decl: &nb::MorDecl) -> (TyS, TyV) {
        let id = QualifiedName::from(mor_decl.id);
        let (mor_type, dom_ty, cod_ty) = match &mor_decl.mor_type {
            nb::MorType::Basic(name) => {
                if let Some(mor_type) = self.theory().basic_mor_type((*name).into()) {
                    let dom_ty = self.theory().src_type(&mor_type);
                    let cod_ty = self.theory().tgt_type(&mor_type);
                    (mor_type, dom_ty, cod_ty)
                } else {
                    return self.ty_error(InvalidDblModel::MorType(id));
                }
            }
            nb::MorType::Hom(ob_type) => match self.ob_type(ob_type.as_ref()) {
                Some(ot) => (self.theory().hom_type(ot.clone()), ot.clone(), ot),
                None => return self.ty_error(InvalidDblModel::MorType(id)),
            },
            _ => {
                return self.ty_error(InvalidDblModel::UnsupportedFeature(Feature::ComplexMorType));
            }
        };
        let Some((dom_s, dom_v, synthed_dom_ty)) = mor_decl.dom.as_ref().and_then(|ob| self.ob(ob))
        else {
            return self.ty_error(InvalidDblModel::Dom(id));
        };
        let Some((cod_s, cod_v, synthed_cod_ty)) = mor_decl.cod.as_ref().and_then(|ob| self.ob(ob))
        else {
            return self.ty_error(InvalidDblModel::Cod(id));
        };
        if synthed_dom_ty != dom_ty {
            return self.ty_error(InvalidDblModel::DomType(id));
        };
        if synthed_cod_ty != cod_ty {
            return self.ty_error(InvalidDblModel::CodType(id));
        };
        (
            TyS::morphism(mor_type.clone(), dom_s, cod_s),
            TyV::morphism(mor_type, dom_v, cod_v),
        )
    }

    fn morphism_cell(&mut self, mor_decl: &nb::MorDecl) -> (NameSegment, LabelSegment, TyS, TyV) {
        let name = NameSegment::Uuid(mor_decl.id);
        let label = LabelSegment::Text(ustr(&mor_decl.name));
        let (ty_s, ty_v) = self.morphism_cell_ty(mor_decl);
        (name, label, ty_s, ty_v)
    }

    fn instantiation_cell_ty(&mut self, i_decl: &nb::InstantiatedModel) -> (TyS, TyV) {
        let name = QualifiedName::single(NameSegment::Uuid(i_decl.id));
        let link = match &i_decl.model {
            Some(l) => l,
            None => return self.ty_error(InvalidDblModel::InvalidLink(name)),
        };
        let notebook_types::v1::LinkType::Instantiation = link.r#type else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        let ref_id = ustr(&link.stable_ref.id);
        let topname = NameSegment::Text(ref_id);
        let Some(TopDecl::Type(type_def)) = self.toplevel.declarations.get(&topname) else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        if type_def.theory != self.theory {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        }
        let mut specializations = Vec::new();
        let TyV_::Record(r) = &*type_def.val else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        let mut r = r.clone();
        for specialization in i_decl.specializations.iter() {
            if let (Some(field_id), Some(ob)) = (&specialization.id, &specialization.ob) {
                let field_name = NameSegment::Uuid(Uuid::from_str(field_id).unwrap());
                let Some((ob_s, ob_v, ob_type)) = self.ob(ob) else {
                    continue;
                };
                let Some((field_label, field_ty)) = r.fields.get_with_label(field_name) else {
                    continue;
                };
                match &**field_ty {
                    TyS_::Object(expected_ob_ty) => {
                        if &ob_type != expected_ob_ty {
                            continue;
                        }
                    }
                    _ => {
                        continue;
                    }
                }
                specializations.push((
                    vec![(field_name, *field_label)],
                    TyS::sing(TyS::object(ob_type.clone()), ob_s),
                ));
                r = r.add_specialization(
                    &[(field_name, *field_label)],
                    TyV::sing(TyV::object(ob_type), ob_v),
                )
            }
        }
        let ty_s = if specializations.is_empty() {
            TyS::topvar(topname)
        } else {
            TyS::specialize(TyS::topvar(topname), specializations)
        };
        (ty_s, TyV::record(r))
    }

    fn instantiation_cell(
        &mut self,
        i_decl: &nb::InstantiatedModel,
    ) -> (NameSegment, LabelSegment, TyS, TyV) {
        let name = NameSegment::Uuid(i_decl.id);
        let label = LabelSegment::Text(ustr(&i_decl.name));
        let (ty_s, ty_v) = self.instantiation_cell_ty(i_decl);
        (name, label, ty_s, ty_v)
    }

    /// Elaborate a notebook into a type.
    pub fn notebook<'b>(
        &mut self,
        cells: impl Iterator<Item = &'b nb::ModelJudgment>,
    ) -> (TyS, TyV) {
        // Make two passes to allow morphisms to reference objects that appear
        // later in the notebook. This is important because the UI allows users
        // to reorder cells freely, and morphisms should be able to reference
        // any object regardless of cell order.
        //
        // Pass 1: Process all object and instantiation declarations to populate the context.
        // Pass 2: Process all morphism declarations (which can now resolve any
        // object reference).
        let (pass1, pass2): (Vec<_>, Vec<_>) = cells.partition(|cell| {
            matches!(cell, nb::ModelJudgment::Object(_) | nb::ModelJudgment::Instantiation(_))
        });

        let mut field_ty_vs = Vec::new();
        let self_var = self.intro(name_seg("self"), label_seg("self"), None).unwrap_neu();
        let c = self.checkpoint();

        for cell in pass1.into_iter().chain(pass2.into_iter()) {
            let (name, label, _, ty_v) = match &cell {
                nb::ModelJudgment::Object(ob_decl) => self.object_cell(ob_decl),
                nb::ModelJudgment::Morphism(mor_decl) => self.morphism_cell(mor_decl),
                nb::ModelJudgment::Instantiation(i_decl) => self.instantiation_cell(i_decl),
            };
            field_ty_vs.push((name, (label, ty_v.clone())));
            self.ctx.scope.push(VarInContext::new(name, label, Some(ty_v.clone())));
            self.ctx.env =
                self.ctx.env.snoc(TmV::neu(TmN::proj(self_var.clone(), name, label), ty_v));
        }

        self.reset_to(c);
        let field_tys: Row<_> = field_ty_vs
            .iter()
            .map(|(name, (label, ty_v))| (*name, (*label, self.evaluator().quote_ty(ty_v))))
            .collect();
        let r_s = RecordS::new(field_tys.clone());
        let r_v = RecordV::new(self.ctx.env.clone(), field_tys, Dtry::empty());
        (TyS::record(r_s), TyV::record(r_v))
    }
}

#[cfg(test)]
mod test {
    use expect_test::{Expect, expect};
    use serde_json;
    use std::{fmt::Write, fs};
    use ustr::ustr;

    use crate::dbl::model::DblModelPrinter;
    use crate::stdlib::th_schema;
    use crate::tt::{
        modelgen::generate,
        notebook_elab::Elaborator,
        theory::{Theory, TheoryDef},
        toplevel::Toplevel,
    };
    use crate::zero::name;
    use notebook_types::current::ModelDocumentContent;

    fn elab_example(theory: &Theory, name: &str, expected: Expect) {
        let src = fs::read_to_string(format!("examples/tt/notebook/{name}.json")).unwrap();
        let doc: ModelDocumentContent = serde_json::from_str(&src).unwrap();
        let toplevel = Toplevel::new(Default::default());
        let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));
        let (_, ty_v) = elab.notebook(doc.notebook.formal_content());
        let (model, ns) = generate(&toplevel, &theory.definition, &ty_v);
        let mut out = model.to_doc(&DblModelPrinter::new(), &ns).pretty().to_string();
        for error in elab.errors() {
            writeln!(&mut out, "error {:?}", error).unwrap()
        }
        expected.assert_eq(&out);
    }

    #[test]
    fn discrete_theory() {
        let th_schema = Theory::new(name("ThSchema"), TheoryDef::discrete(th_schema()));
        elab_example(
            &th_schema,
            "weighted_graph",
            expect![[r#"
                model generated by 3 objects and 3 morphisms
                E : Entity
                V : Entity
                Weight : AttrType
                weight : E -> Weight : Attr
                src : E -> V : Hom Entity
                tgt : E -> V : Hom Entity"#]],
        );
    }

    /// Test that morphisms can reference objects that appear later in the notebook.
    #[test]
    fn morphism_before_codomain() {
        let th_schema = Theory::new(name("ThSchema"), TheoryDef::discrete(th_schema()));
        // In this example, the cell order is: A (object), f (morphism A->B), B (object)
        elab_example(
            &th_schema,
            "morphism_before_codomain",
            expect![[r#"
                model generated by 2 objects and 1 morphism
                A : Entity
                B : Entity
                f : A -> B : Hom Entity"#]],
        );
    }
}
