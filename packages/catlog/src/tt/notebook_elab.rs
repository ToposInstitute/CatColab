//! Elaboration for frontend notebooks.
use fnotation::token::Kind::SPECIAL;
use notebook_types::v1::{InstantiatedModel, ModelJudgment, MorDecl, Ob, ObDecl, ObType};
use uuid::Uuid;

use crate::dbl::{
    model::{Feature, InvalidDblModel},
    theory::{DblTheory, DiscreteDblTheory},
};
use std::str::FromStr;

use crate::{
    tt::{context::*, eval::*, prelude::*, stx::*, toplevel::*, val::*},
    zero::QualifiedName,
};

// There is some infrastructure that needs to be put into place before
// notebook elaboration can be fully successful.
//
// First of all, we need an error reporting strategy adapted for the
// notebook interface.
//
// As a first pass, we will associate the cell uuid with errors. I think
// that it makes sense to have an entirely separate file for notebook
// elaboration, mainly because the error reporting is going to be so
// different.
//
// Another reason for a separate file is that we can handle the caching
// there. Ideally, actually, the existing `Toplevel` struct should work
// just fine.
//
// It is also desirable to extract a "partial model" from a notebook.
// I think that this is possible if we simply ignore any cells that have
// errors, including cells that depend on cells that have errors.

/// The current state of a notebook elaboration session.
///
/// We feed a notebook into this cell-by-cell.
pub struct Elaborator<'a> {
    theory: Theory,
    toplevel: &'a Toplevel,
    ctx: Context,
    errors: Vec<InvalidDblModel>,
    ref_id: Uuid,
    next_meta: usize,
}

struct ElaboratorCheckpoint {
    ctx: ContextCheckpoint,
}

impl<'a> Elaborator<'a> {
    /// Create a new notebook elaborator
    pub fn new(theory: Theory, toplevel: &'a Toplevel, ref_id: Uuid) -> Self {
        Self {
            theory,
            toplevel,
            ctx: Context::new(),
            errors: Vec::new(),
            ref_id,
            next_meta: 0,
        }
    }

    fn dbl_theory(&self) -> &DiscreteDblTheory {
        &self.theory.definition
    }

    /// Get all of the errors from elaboration
    pub fn errors(&self) -> &[InvalidDblModel] {
        &self.errors
    }

    fn checkpoint(&self) -> ElaboratorCheckpoint {
        ElaboratorCheckpoint {
            ctx: self.ctx.checkpoint(),
        }
    }

    fn reset_to(&mut self, c: ElaboratorCheckpoint) {
        self.ctx.reset_to(c.ctx);
    }

    fn evaluator(&self) -> Evaluator<'a> {
        Evaluator::new(self.toplevel, self.ctx.env.clone(), self.ctx.scope.len())
    }

    fn intro(&mut self, name: VarName, label: LabelSegment, ty: Option<TyV>) -> TmV {
        let v = TmV::Neu(
            TmN::var(self.ctx.scope.len().into(), name, label),
            ty.clone().unwrap_or(TyV::unit()),
        );
        let v = if let Some(ty) = &ty {
            self.evaluator().eta(&v, ty)
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

    fn syn_error(&mut self, error: InvalidDblModel) -> (TmS, TmV, TyV) {
        self.errors.push(error);
        let tm_m = self.fresh_meta();
        let ty_m = self.fresh_meta();
        (TmS::meta(tm_m), TmV::Meta(tm_m), TyV::meta(ty_m))
    }

    fn ty_error(&mut self, error: InvalidDblModel) -> (TyS, TyV) {
        self.errors.push(error);
        let ty_m = self.fresh_meta();
        (TyS::meta(ty_m), TyV::meta(ty_m))
    }

    fn ob_type(&mut self, ob_type: &ObType) -> Option<QualifiedName> {
        match &ob_type {
            ObType::Basic(name) => Some(QualifiedName::single(NameSegment::Text(*name))),
            ObType::Tabulator(_) => None,
            ObType::ModeApp { .. } => None,
        }
    }

    fn object_cell(&mut self, ob_decl: &ObDecl) -> (NameSegment, LabelSegment, TyS, TyV) {
        let name = NameSegment::Uuid(ob_decl.id);
        let label = LabelSegment::Text(ustr(&ob_decl.name));
        let (ty_s, ty_v) = match self.ob_type(&ob_decl.ob_type) {
            Some(ob_type) => (TyS::object(ob_type.clone()), TyV::object(ob_type)),
            None => self.ty_error(InvalidDblModel::ObType(QualifiedName::single(name))),
        };
        (name, label, ty_s, ty_v)
    }

    fn lookup_tm(&mut self, name: VarName) -> Option<(TmS, TmV, TyV)> {
        let Some((i, label, ty)) = self.ctx.lookup(name) else {
            return None;
        };
        let v = self.ctx.env.get(*i).unwrap().clone();
        Some((TmS::var(i, name, label), v, ty.clone().unwrap()))
    }

    fn ob(&mut self, n: &Ob) -> Option<(TmS, TmV, ObjectType)> {
        match n {
            Ob::Basic(name) => {
                let (tm, val, ty) =
                    self.lookup_tm(NameSegment::Uuid(Uuid::from_str(name).unwrap()))?;
                let ob_type = match &*ty {
                    TyV_::Object(ob_type) => ob_type.clone(),
                    _ => {
                        return None;
                    }
                };
                Some((tm, val, ob_type))
            }
            Ob::App { .. } => None,
            Ob::List { .. } => None,
            Ob::Tabulated(_) => None,
        }
    }

    fn morphism_cell_ty(&mut self, mor_decl: &MorDecl) -> (TyS, TyV) {
        let name = QualifiedName::single(NameSegment::Uuid(mor_decl.id));
        let (mor_type, dom_ty, cod_ty) = match &mor_decl.mor_type {
            notebook_types::v1::MorType::Basic(name) => {
                let name = QualifiedName::single(name_seg(*name));
                let mor_type = Path::single(name);
                let dom_ty = self.dbl_theory().src_type(&mor_type);
                let cod_ty = self.dbl_theory().tgt_type(&mor_type);
                (MorphismType(mor_type), dom_ty, cod_ty)
            }
            notebook_types::v1::MorType::Hom(ob_type) => match self.ob_type(ob_type) {
                Some(ob_type) => {
                    (MorphismType(Path::Id(ob_type.clone())), ob_type.clone(), ob_type)
                }
                None => return self.ty_error(InvalidDblModel::MorType(name)),
            },
            notebook_types::v1::MorType::Composite(_) => {
                return self
                    .ty_error(InvalidDblModel::UnsupportedFeature(Feature::CompositeMorType));
            }
            notebook_types::v1::MorType::ModeApp { .. } => {
                return self.ty_error(InvalidDblModel::UnsupportedFeature(Feature::Modal));
            }
        };
        let Some((dom_s, dom_v, synthed_dom_ty)) = mor_decl.dom.as_ref().and_then(|ob| self.ob(ob))
        else {
            return self.ty_error(InvalidDblModel::Dom(name));
        };
        let Some((cod_s, cod_v, synthed_cod_ty)) = mor_decl.cod.as_ref().and_then(|ob| self.ob(ob))
        else {
            return self.ty_error(InvalidDblModel::Cod(name));
        };
        if synthed_dom_ty != dom_ty {
            return self.ty_error(InvalidDblModel::DomType(name));
        };
        if synthed_cod_ty != cod_ty {
            return self.ty_error(InvalidDblModel::CodType(name));
        };
        (
            TyS::morphism(mor_type.clone(), dom_s, cod_s),
            TyV::morphism(mor_type, dom_v, cod_v),
        )
    }

    fn morphism_cell(&mut self, mor_decl: &MorDecl) -> (NameSegment, LabelSegment, TyS, TyV) {
        let name = NameSegment::Uuid(mor_decl.id);
        let label = LabelSegment::Text(ustr(&mor_decl.name));
        let (ty_s, ty_v) = self.morphism_cell_ty(mor_decl);
        (name, label, ty_s, ty_v)
    }

    fn instantiation_cell_ty(&mut self, i_decl: &InstantiatedModel) -> (TyS, TyV) {
        let name = QualifiedName::single(NameSegment::Uuid(i_decl.id));
        let link = match &i_decl.model {
            Some(l) => l,
            None => return self.ty_error(InvalidDblModel::InvalidLink(name)),
        };
        let notebook_types::v1::LinkType::Instantiation = link.r#type else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        let ref_id = Uuid::from_str(&link.stable_ref.id).unwrap();
        let topname = NameSegment::Uuid(ref_id);
        let Some(TopDecl::Type(type_def)) = self.toplevel.declarations.get(&topname) else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        if &type_def.theory != &self.theory {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        }
        let mut specializations = Vec::new();
        let TyV_::Record(r) = &*type_def.val else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        let mut r = r.clone();
        for specialization in i_decl.specializations.iter() {
            if let (Some(field_id), Some(ob)) = (&specialization.id, &specialization.ob) {
                let field_name = NameSegment::Uuid(Uuid::from_str(&field_id).unwrap());
                let Some((ob_s, ob_v, ob_type)) = self.ob(ob) else {
                    continue;
                };
                let Some((field_label, field_ty)) = r.fields1.get_with_label(field_name) else {
                    continue;
                };
                match &**field_ty {
                    TyS_::Object(expected_ob_ty) => {
                        if &ob_type != expected_ob_ty {
                            continue;
                        }
                    }
                    _ => {}
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
        i_decl: &InstantiatedModel,
    ) -> (NameSegment, LabelSegment, TyS, TyV) {
        let name = NameSegment::Uuid(i_decl.id);
        let label = LabelSegment::Text(ustr(&i_decl.name));
        let (ty_s, ty_v) = self.instantiation_cell_ty(i_decl);
        (name, label, ty_s, ty_v)
    }

    /// Elaborate a notebook into a type.
    pub fn notebook(&mut self, cells: &[(Uuid, &ModelJudgment)]) -> Option<(TyS, TyV)> {
        let mut field_ty0s = Vec::new();
        let mut field_ty_vs = Vec::new();
        let self_var = self.intro(name_seg("self"), label_seg("self"), None).as_neu();
        let c = self.checkpoint();
        for (_, cell) in cells.iter() {
            let (name, label, _, ty_v) = match cell {
                ModelJudgment::Object(ob_decl) => self.object_cell(ob_decl),
                ModelJudgment::Morphism(mor_decl) => self.morphism_cell(mor_decl),
                ModelJudgment::Instantiation(i_decl) => self.instantiation_cell(i_decl),
            };
            field_ty0s.push((name, (label, ty_v.ty0())));
            field_ty_vs.push((name, (label, ty_v.clone())));
            self.ctx.scope.push(VarInContext::new(name, label, Some(ty_v.clone())));
            self.ctx.env =
                self.ctx.env.snoc(TmV::Neu(TmN::proj(self_var.clone(), name, label), ty_v));
        }
        self.reset_to(c);
        let field_tys: Row<_> = field_ty_vs
            .iter()
            .map(|(name, (label, ty_v))| (*name, (*label, self.evaluator().quote_ty(ty_v))))
            .collect();
        let field_ty0s: Row<_> = field_ty0s.into_iter().collect();
        let r_s = RecordS::new(field_ty0s.clone(), field_tys.clone());
        let r_v = RecordV::new(field_ty0s, self.ctx.env.clone(), field_tys, Dtry::empty());
        Some((TyS::record(r_s), TyV::record(r_v)))
    }
}

#[cfg(test)]
mod test {
    use notebook_types::v1::ModelDocumentContent;
    use serde_json;
    use std::fmt::Write;
    use std::{fs, rc::Rc};
    use uuid::Uuid;

    use expect_test::{Expect, expect};

    use crate::stdlib::th_schema;
    use crate::tt::toplevel::{Theory, std_theories};
    use crate::tt::{
        modelgen::{generate, model_output},
        notebook_elab::Elaborator,
        toplevel::Toplevel,
    };
    use crate::zero::name;

    fn elab_example(theory: &Theory, name: &str, expected: Expect) {
        let src = fs::read_to_string(format!("examples/{name}.json")).unwrap();
        let doc: ModelDocumentContent = serde_json::from_str(&src).unwrap();
        let cells = doc
            .notebook
            .cells()
            .filter_map(|c| match c {
                notebook_types::v1::NotebookCell::Formal { id, content } => Some((*id, content)),
                _ => None,
            })
            .collect::<Vec<_>>();
        let toplevel = Toplevel::new(std_theories());
        let mut elab = Elaborator::new(theory.clone(), &toplevel, Uuid::nil());
        let mut out = String::new();
        if let Some((_, ty_v)) = elab.notebook(&cells) {
            let (model, name_translation) = generate(&toplevel, theory, &ty_v);
            model_output("", &mut out, &model, &name_translation).unwrap();
        } else {
            assert!(
                !elab.errors().is_empty(),
                "did not produce a model, but no errors were reported"
            );
            for error in elab.errors() {
                writeln!(&mut out, "error {:?}", error).unwrap()
            }
        }
        expected.assert_eq(&out);
    }

    #[test]
    fn examples() {
        let th_schema = Theory::new(name("ThSchema"), Rc::new(th_schema()));
        elab_example(
            &th_schema,
            "weighted_graph",
            expect![[r#"
                object generators:
                  E : Entity
                  V : Entity
                  Weight : AttrType
                morphism generators:
                  weight : E -> Weight (Attr)
                  src : E -> V (Id Entity)
                  tgt : E -> V (Id Entity)
            "#]],
        );
    }
}
