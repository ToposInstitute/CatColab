//! Elaboration for frontend notebooks.
//!
//! The notebook elaborator is disjoint from the [text
//! elaborator](super::text_elab). One reason for this is that error reporting
//! must be completely different to be well adapted to the notebook interface.
//! As a first pass, we are associating cell UUIDs with errors.

use catcolab_document_types::current as nb;
use nonempty::NonEmpty;
use std::str::FromStr;
use uuid::Uuid;

use super::{context::*, eval::*, prelude::*, stx::*, theory::*, toplevel::*, val::*};
use crate::dbl::{
    modal,
    model::{Feature, InvalidDblModel, InvalidModelEqn},
};
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

    fn intro(&mut self, name: VarName, label: LabelSegment, ty: Option<BaseTyV>) -> BaseTmV {
        let v = BaseTmV::neu(
            TmN::var(self.ctx.scope.len().into(), name, label),
            ty.clone().unwrap_or(BaseTyV::empty_record()),
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

    fn ty_error(&mut self, error: InvalidDblModel) -> (BaseTyS, BaseTyV) {
        self.errors.push(error);
        let ty_m = self.fresh_meta();
        (BaseTyS::meta(ty_m), BaseTyV::meta(ty_m))
    }

    fn ob_type(&mut self, ob_type: &nb::ObType) -> Option<ObType> {
        match &ob_type {
            nb::ObType::Basic(name) => self.theory().basic_ob_type((*name).into()),
            nb::ObType::Tabulator(_) => None,
            nb::ObType::ModeApp { .. } => None,
        }
    }

    fn object_cell(
        &mut self,
        ob_decl: &nb::ObDecl,
    ) -> (NameSegment, LabelSegment, BaseTyS, BaseTyV) {
        let name = NameSegment::Uuid(ob_decl.id);
        let label = LabelSegment::Text(ustr(&ob_decl.name));
        let (ty_s, ty_v) = match self.ob_type(&ob_decl.ob_type) {
            Some(ob_type) => (BaseTyS::object(ob_type.clone()), BaseTyV::object(ob_type)),
            None => self.ty_error(InvalidDblModel::ObType(QualifiedName::single(name))),
        };
        (name, label, ty_s, ty_v)
    }

    fn lookup_tm(&self, name: VarName) -> Option<(BaseTmS, BaseTmV, BaseTyV)> {
        let (i, label, ty) = self.ctx.lookup(name)?;
        let v = self.ctx.env.get(*i).unwrap().clone();
        Some((BaseTmS::var(i, name, label), v, ty.clone().unwrap()))
    }

    fn resolve_name(&self, segments: &[VarName]) -> Option<(BaseTmS, BaseTmV, BaseTyV)> {
        let (&last, rest) = segments.split_last()?;
        if rest.is_empty() {
            self.lookup_tm(last)
        } else {
            let (tm_s, tm_v, ty_v) = self.resolve_name(rest)?;
            let BaseTyV_::Record(r) = &*ty_v else {
                return None;
            };
            let &(label, _) = r.fields.get_with_label(last)?;
            Some((
                BaseTmS::proj(tm_s, last, label),
                self.evaluator().proj(&tm_v, last, label),
                self.evaluator().field_ty(&ty_v, &tm_v, last),
            ))
        }
    }

    fn ob_syn(&self, n: &nb::Ob) -> Option<(BaseTmS, BaseTmV, ObType)> {
        match n {
            nb::Ob::Basic(name) => {
                let name = QualifiedName::deserialize_str(name).unwrap();
                let (stx, val, ty) = self.resolve_name(name.as_slice())?;
                let BaseTyV_::Object(ob_type) = &*ty else {
                    return None;
                };
                Some((stx, val, ob_type.clone()))
            }
            nb::Ob::App { op: nb::ObOp::Basic(name), ob } => {
                let name = name_seg(*name);
                let ob_op = self.theory().basic_ob_op([name].into())?;
                let arg_type = self.theory().ob_op_dom(&ob_op);
                let (arg_stx, arg_val) = self.ob_chk(ob, &arg_type)?;
                let stx = BaseTmS::ob_app(name, arg_stx);
                let val = BaseTmV::app(name, arg_val);
                Some((stx, val, self.theory().ob_op_cod(&ob_op)))
            }
            nb::Ob::Tabulated(mor) => {
                let (mor_stx, mor_val, mor_ty) = self.mor_syn(mor)?;
                let BaseTyV_::Morphism(mt, _, _) = &*mor_ty else {
                    return None;
                };
                let ob_type = self.theory().tabulator(mt.clone())?;
                Some((BaseTmS::tab(mor_stx), BaseTmV::tab(mor_val), ob_type))
            }
            _ => None,
        }
    }

    fn mor_syn(&self, n: &nb::Mor) -> Option<(BaseTmS, BaseTmV, BaseTyV)> {
        match n {
            nb::Mor::Basic(name) => {
                let name = QualifiedName::deserialize_str(name).unwrap();
                let (stx, val, ty) = self.resolve_name(name.as_slice())?;
                let BaseTyV_::Morphism(..) = &*ty else {
                    return None;
                };
                Some((stx, val, ty))
            }
            nb::Mor::Composite(path) => match path.as_ref() {
                nb::path::Path::Id(ob) => {
                    let (stx, val, ob_type) = self.ob_syn(ob)?;
                    let mor_type = self.theory().hom_type(ob_type)?;
                    Some((stx, val.clone(), BaseTyV::morphism(mor_type, val.clone(), val.clone())))
                }
                nb::path::Path::Seq(ms) => match ms.as_slice() {
                    [] => None,
                    [only] => self.mor_syn(only),
                    [first, rest @ ..] => {
                        let (stx_first, val_first, type_first) = self.mor_syn(first)?;
                        let rest = nb::Mor::Composite(Box::new(nb::path::Path::Seq(rest.to_vec())));
                        let (stx_rest, val_rest, type_rest) = self.mor_syn(&rest)?;
                        let BaseTyV_::Morphism(mt_first, dom_first, cod_first) = &*type_first
                        else {
                            unreachable!()
                        };
                        let BaseTyV_::Morphism(mt_rest, dom_rest, cod_rest) = &*type_rest else {
                            unreachable!()
                        };
                        if mt_first != mt_rest {
                            return None;
                        }
                        if self.evaluator().equal_tm(cod_first, dom_rest).is_err() {
                            return None;
                        }
                        let stx = BaseTmS::compose(stx_first, stx_rest);
                        let val = BaseTmV::compose(val_first, val_rest);
                        Some((
                            stx,
                            val,
                            BaseTyV::morphism(
                                mt_first.clone(),
                                dom_first.clone(),
                                cod_rest.clone(),
                            ),
                        ))
                    }
                },
            },
            _ => None, // tabulator morphisms tbd
        }
    }

    fn ob_chk(&self, n: &nb::Ob, ob_type: &ObType) -> Option<(BaseTmS, BaseTmV)> {
        match n {
            nb::Ob::List { modality: nb_modality, objects: elems } => {
                let (modality, ob_type) = ob_type.clone().mode_app()?;
                if promote_modality(*nb_modality) != modality {
                    return None;
                }
                let mut elem_stxs = Vec::new();
                let mut elem_vals = Vec::new();
                for elem in elems {
                    let (tm_s, tm_v) = self.ob_chk(elem.as_ref()?, &ob_type)?;
                    elem_stxs.push(tm_s);
                    elem_vals.push(tm_v);
                }
                Some((BaseTmS::list(elem_stxs), BaseTmV::list(elem_vals)))
            }
            _ => {
                let (tm_s, tm_v, synthed) = self.ob_syn(n)?;
                if synthed == *ob_type {
                    Some((tm_s, tm_v))
                } else {
                    None
                }
            }
        }
    }

    fn morphism_cell_ty(&mut self, mor_decl: &nb::MorDecl) -> (BaseTyS, BaseTyV) {
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
                Some(ot) => match self.theory().hom_type(ot.clone()) {
                    Some(mt) => (mt, ot.clone(), ot),
                    None => return self.ty_error(InvalidDblModel::MorType(id)),
                },
                None => return self.ty_error(InvalidDblModel::MorType(id)),
            },
            _ => {
                return self.ty_error(InvalidDblModel::UnsupportedFeature(Feature::ComplexMorType));
            }
        };
        let Some((dom_s, dom_v)) = mor_decl.dom.as_ref().and_then(|ob| self.ob_chk(ob, &dom_ty))
        else {
            return self.ty_error(InvalidDblModel::DomType(id));
        };
        let Some((cod_s, cod_v)) = mor_decl.cod.as_ref().and_then(|ob| self.ob_chk(ob, &cod_ty))
        else {
            return self.ty_error(InvalidDblModel::CodType(id));
        };
        (
            BaseTyS::morphism(mor_type.clone(), dom_s, cod_s),
            BaseTyV::morphism(mor_type, dom_v, cod_v),
        )
    }

    fn morphism_cell(
        &mut self,
        mor_decl: &nb::MorDecl,
    ) -> (NameSegment, LabelSegment, BaseTyS, BaseTyV) {
        let name = NameSegment::Uuid(mor_decl.id);
        let label = LabelSegment::Text(ustr(&mor_decl.name));
        let (ty_s, ty_v) = self.morphism_cell_ty(mor_decl);
        (name, label, ty_s, ty_v)
    }

    fn equation_cell_ty(&mut self, eqn_decl: &nb::EqnDecl) -> (BaseTyS, BaseTyV) {
        let (lhs_m, rhs_m) = match (&eqn_decl.lhs, &eqn_decl.rhs) {
            (Some(lhs), Some(rhs)) => (lhs, rhs),
            _ => {
                return self
                    .ty_error(InvalidDblModel::UnsupportedFeature(Feature::PartialEquation));
            }
        };
        let mut errors = Vec::new();
        let lhs = match self.mor_syn(lhs_m) {
            Some(synthed) => Some(synthed),
            None => {
                errors.push(InvalidModelEqn::Lhs);
                None
            }
        };
        let rhs = match self.mor_syn(rhs_m) {
            Some(synthed) => Some(synthed),
            None => {
                errors.push(InvalidModelEqn::Rhs);
                None
            }
        };

        if let (Some((_, _, lhs_ty)), Some((_, _, rhs_ty))) = (&lhs, &rhs) {
            let BaseTyV_::Morphism(mt_lhs, dom_lhs, cod_lhs) = &**lhs_ty else {
                unreachable!()
            };
            let BaseTyV_::Morphism(mt_rhs, dom_rhs, cod_rhs) = &**rhs_ty else {
                unreachable!()
            };
            if mt_lhs != mt_rhs {
                errors.push(InvalidModelEqn::MorType);
            } else {
                if self.evaluator().equal_tm(dom_lhs, dom_rhs).is_err() {
                    errors.push(InvalidModelEqn::Src);
                }
                if self.evaluator().equal_tm(cod_lhs, cod_rhs).is_err() {
                    errors.push(InvalidModelEqn::Tgt);
                }
            }
        }
        match (NonEmpty::from_vec(errors), lhs, rhs) {
            (None, Some((lhs_s, lhs_v, lhs_ty)), Some((rhs_s, rhs_v, _))) => {
                let ty_s = BaseTyS::id(self.evaluator().quote_ty(&lhs_ty), lhs_s, rhs_s);
                let ty_v = BaseTyV::id(lhs_ty, lhs_v, rhs_v);
                (ty_s, ty_v)
            }
            (Some(errors), _, _) => {
                // FIXME: The assumption in InvalidDblModel that we should already have the vector of equations
                // built up, so as to give the index in the first argument here, doesn't hold in this case.
                // It would be best not to use InvalidDblModel here before we've begun
                // to build a DblModel.
                self.ty_error(InvalidDblModel::Eqn(None, errors))
            }
            _ => unreachable!(),
        }
    }

    fn equation_cell(
        &mut self,
        eqn_decl: &nb::EqnDecl,
    ) -> (NameSegment, LabelSegment, BaseTyS, BaseTyV) {
        // Kind of funny that the decl's id produces the cell's name
        // but the decl's name produces the cell's label.
        let name = NameSegment::Uuid(eqn_decl.id);
        let label = LabelSegment::Text(ustr(&eqn_decl.name));
        let (ty_s, ty_v) = self.equation_cell_ty(eqn_decl);
        (name, label, ty_s, ty_v)
    }

    fn instantiation_cell_ty(&mut self, i_decl: &nb::InstantiatedModel) -> (BaseTyS, BaseTyV) {
        let name = QualifiedName::single(NameSegment::Uuid(i_decl.id));
        let link = match &i_decl.model {
            Some(l) => l,
            None => return self.ty_error(InvalidDblModel::InvalidLink(name)),
        };
        let catcolab_document_types::current::LinkType::Instantiation = link.r#type else {
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
        let BaseTyV_::Record(r) = &*type_def.val else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        let mut r = r.clone();
        for specialization in i_decl.specializations.iter() {
            if let (Some(field_id), Some(ob)) = (&specialization.id, &specialization.ob) {
                let field_name = NameSegment::Uuid(Uuid::from_str(field_id).unwrap());
                let Some((ob_s, ob_v, ob_type)) = self.ob_syn(ob) else {
                    continue;
                };
                let Some((field_label, field_ty)) = r.fields.get_with_label(field_name) else {
                    continue;
                };
                match &**field_ty {
                    BaseTyS_::Object(expected_ob_ty) => {
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
                    BaseTyS::sing(BaseTyS::object(ob_type.clone()), ob_s),
                ));
                r = r.add_specialization(
                    &[(field_name, *field_label)],
                    BaseTyV::sing(BaseTyV::object(ob_type), ob_v),
                )
            }
        }
        let ty_s = if specializations.is_empty() {
            BaseTyS::topvar(topname)
        } else {
            BaseTyS::specialize(BaseTyS::topvar(topname), specializations)
        };
        (ty_s, BaseTyV::record(r))
    }

    fn instantiation_cell(
        &mut self,
        i_decl: &nb::InstantiatedModel,
    ) -> (NameSegment, LabelSegment, BaseTyS, BaseTyV) {
        let name = NameSegment::Uuid(i_decl.id);
        let label = LabelSegment::Text(ustr(&i_decl.name));
        let (ty_s, ty_v) = self.instantiation_cell_ty(i_decl);
        (name, label, ty_s, ty_v)
    }

    /// Elaborate a notebook into a type.
    pub fn notebook<'b>(
        &mut self,
        cells: impl Iterator<Item = &'b nb::ModelJudgment>,
    ) -> (BaseTyS, BaseTyV) {
        // Process the cells in dependency order. This is important because the
        // UI allows users to reorder cells freely and that shouldn't affect the
        // result of elaboration.
        let mut cells: Vec<_> = cells.collect();
        cells.sort_by_key(|judgment| match judgment {
            nb::ModelJudgment::Object(_) => 0,
            nb::ModelJudgment::Instantiation(_) => 1,
            nb::ModelJudgment::Morphism(_) => 2,
            nb::ModelJudgment::Equation(_) => 3,
        });

        let mut field_ty_vs = Vec::new();
        let self_var = self.intro(name_seg("self"), label_seg("self"), None).unwrap_neu();
        let c = self.checkpoint();

        for cell in cells {
            let (name, label, _, ty_v) = match &cell {
                nb::ModelJudgment::Object(ob_decl) => self.object_cell(ob_decl),
                nb::ModelJudgment::Morphism(mor_decl) => self.morphism_cell(mor_decl),
                nb::ModelJudgment::Instantiation(i_decl) => self.instantiation_cell(i_decl),
                nb::ModelJudgment::Equation(eqn_decl) => self.equation_cell(eqn_decl),
            };
            field_ty_vs.push((name, (label, ty_v.clone())));
            self.ctx.scope.push(VarInContext::new(name, label, Some(ty_v.clone())));
            self.ctx.env =
                self.ctx.env.snoc(BaseTmV::neu(TmN::proj(self_var.clone(), name, label), ty_v));
        }

        self.reset_to(c);
        let field_tys: Row<_> = field_ty_vs
            .iter()
            .map(|(name, (label, ty_v))| (*name, (*label, self.evaluator().quote_ty(ty_v))))
            .collect();
        let r_v = RecordV::new(self.ctx.env.clone(), field_tys.clone(), Dtry::empty());
        (BaseTyS::record(field_tys), BaseTyV::record(r_v))
    }

    // ================= DIAGRAM == //

    fn diag_object_cell(
        &mut self,
        model: &RecordV,
        ob_decl: &nb::DiagramObDecl,
    ) -> (NameSegment, LabelSegment, BaseTyS, BaseTyV) {
        let name = NameSegment::Uuid(ob_decl.id);
        let label = LabelSegment::Text(ustr(&ob_decl.name));

        let over_uuid = match &ob_decl.over {
            Some(nb::Ob::Basic(id)) => id,
            _ => panic!("expected basic"),
        };
        let over_name = NameSegment::Uuid(Uuid::parse_str(&over_uuid).unwrap());
        let Some((_, (over_label, _))) = model.fields.iter().find(|(n, _)| *n == &over_name) else {
            panic!("over reference not found in codomain model");
        };

        let path = vec![(over_name, *over_label)];
        (name, label, BaseTyS::over(path.clone()), BaseTyV::over(path))
    }

    fn diag_morphism_cell_ty(
        &mut self,
        model: &RecordV,
        mor_decl: &nb::DiagramMorDecl,
    ) -> (BaseTyS, BaseTyV, Vec<(BaseTmS, BaseTmS)>, Vec<(BaseTmV, BaseTmV)>) {
        let over_uuid = match &mor_decl.over {
            Some(nb::Mor::Basic(id)) => id,
            _ => panic!("expected basic over reference"),
        };
        let over_name = NameSegment::Uuid(Uuid::parse_str(&over_uuid).unwrap());
        let Some((_, (over_label, mor_ty_s))) = model.fields.iter().find(|(n, _)| *n == &over_name)
        else {
            panic!("over morphism not found in codomain");
        };
        let BaseTyS_::Morphism(mt, cod_dom_s, _cod_cod_s) = &**mor_ty_s else {
            panic!("over reference is not a morphism");
        };

        let ob_op = match &**cod_dom_s {
            BaseTmS_::ObApp(op, _) => Some(*op),
            _ => None,
        };

        let mut dom_stxs = Vec::new();
        let mut dom_vals = Vec::new();
        let mut dom_tys = Vec::new();
        match &mor_decl.dom {
            Some(nb::Ob::List { objects, .. }) => {
                for ob in objects {
                    let id = match ob {
                        Some(nb::Ob::Basic(id)) => id,
                        _ => panic!(),
                    };
                    let Some((s, v, ty)) =
                        self.lookup_tm(NameSegment::Uuid(Uuid::parse_str(&id).unwrap()))
                    else {
                        panic!()
                    };
                    dom_stxs.push(s);
                    dom_vals.push(v);
                    dom_tys.push(ty);
                }
            }

            Some(nb::Ob::Basic(id)) => {
                let Some((s, v, ty)) =
                    self.lookup_tm(NameSegment::Uuid(Uuid::parse_str(&id).unwrap()))
                else {
                    panic!()
                };
                dom_stxs.push(s);
                dom_vals.push(v);
                dom_tys.push(ty);
            }

            _ => todo!(),
        }

        let (dom_s, dom_v) = if let Some(op) = ob_op {
            (
                BaseTmS::ob_app(op, BaseTmS::list(dom_stxs.clone())),
                BaseTmV::app(op, BaseTmV::list(dom_vals.clone())),
            )
        } else {
            (BaseTmS::list(dom_stxs.clone()), BaseTmV::list(dom_vals.clone()))
        };

        let mut cod_stxs = Vec::new();
        let mut cod_vals = Vec::new();
        let mut cod_tys = Vec::new();
        match &mor_decl.cod {
            Some(nb::Ob::List { objects, .. }) => {
                for ob in objects {
                    let id = match ob {
                        Some(nb::Ob::Basic(id)) => id,
                        _ => panic!(),
                    };
                    let Some((s, v, ty)) =
                        self.lookup_tm(NameSegment::Uuid(Uuid::parse_str(&id).unwrap()))
                    else {
                        panic!()
                    };
                    cod_stxs.push(s);
                    cod_vals.push(v);
                    cod_tys.push(ty);
                }
            }
            Some(nb::Ob::Basic(id)) => {
                let Some((s, v, ty)) =
                    self.lookup_tm(NameSegment::Uuid(Uuid::parse_str(&id).unwrap()))
                else {
                    panic!("{}", id)
                };
                cod_stxs.push(s);
                cod_vals.push(v);
                cod_tys.push(ty);
            }
            _ => panic!(),
        }

        let tgt_path = match &*cod_tys[0] {
            BaseTyV_::Over(path) => path.clone(),
            _ => panic!("codomain element is not @over-typed"),
        };

        let mut eqns_s = Vec::new();
        let mut eqns_v = Vec::new();
        for (d_s, c_s) in dom_stxs.iter().zip(cod_stxs.iter()) {
            eqns_s.push((
                BaseTmS::over_app(over_name, *over_label, tgt_path.clone(), d_s.clone()),
                c_s.clone(),
            ));
        }
        for (d_v, c_v) in dom_vals.iter().zip(cod_vals.iter()) {
            eqns_v.push((
                BaseTmV::over_app(over_name, *over_label, tgt_path.clone(), d_v.clone()),
                c_v.clone(),
            ));
        }

        let (cod_s, cod_v) = if let Some(op) = ob_op {
            (
                BaseTmS::ob_app(op, BaseTmS::list(cod_stxs.clone())),
                BaseTmV::app(op, BaseTmV::list(cod_vals.clone())),
            )
        } else {
            (BaseTmS::list(cod_stxs.clone()), BaseTmV::list(cod_vals.clone()))
        };

        (
            BaseTyS::morphism(mt.clone(), dom_s, cod_s),
            BaseTyV::morphism(mt.clone(), dom_v, cod_v),
            eqns_s,
            eqns_v,
        )
    }

    fn diag_morphism_cell(
        &mut self,
        model: &RecordV,
        mor_decl: &nb::DiagramMorDecl,
    ) -> (
        NameSegment,
        LabelSegment,
        BaseTyS,
        BaseTyV,
        Vec<(BaseTmS, BaseTmS)>,
        Vec<(BaseTmV, BaseTmV)>,
    ) {
        let name = NameSegment::Uuid(mor_decl.id);
        // let label = LabelSegment::Text(ustr(&mor_decl.name));

        let over_uuid = match &mor_decl.over {
            Some(nb::Mor::Basic(id)) => id,
            _ => panic!("expected basic"),
        };
        let over_name = NameSegment::Uuid(Uuid::parse_str(&over_uuid).unwrap());
        let Some((_, (over_label, _))) = model.fields.iter().find(|(n, _)| *n == &over_name) else {
            panic!("over reference not found in codomain model");
        };

        let (ty_s, ty_v, eqns_s, eqns_v) = self.diag_morphism_cell_ty(model, mor_decl);
        (name, over_label.clone(), ty_s, ty_v, eqns_s, eqns_v)
    }

    fn diag_instantiation_cell_ty(
        &mut self,
        i_decl: &nb::InstantiatedDiagram,
    ) -> (BaseTyS, BaseTyV) {
        let name = QualifiedName::single(NameSegment::Uuid(i_decl.id));
        let link = match &i_decl.diagram {
            Some(l) => l,
            None => return self.ty_error(InvalidDblModel::InvalidLink(name)),
        };
        let catcolab_document_types::current::LinkType::Instantiation = link.r#type else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        let ref_id = ustr(&link.stable_ref.id);
        let topname = NameSegment::Text(ref_id);
        let Some(TopDecl::Diag(diag_def)) = self.toplevel.declarations.get(&topname) else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        let mut specializations = Vec::new();
        let BaseTyV_::Record(r) = &*diag_def.body_ty else {
            return self.ty_error(InvalidDblModel::InvalidLink(name));
        };
        let mut r = r.clone();
        for specialization in i_decl.specializations.iter() {
            if let (Some(field_id), Some(ob)) = (&specialization.id, &specialization.ob) {
                let field_name = NameSegment::Uuid(Uuid::from_str(field_id).unwrap());
                let ob_name = match ob {
                    nb::Ob::Basic(id) => NameSegment::Uuid(Uuid::parse_str(id).unwrap()),
                    _ => continue,
                };
                let Some((ob_s, ob_v, ob_ty)) = self.lookup_tm(ob_name) else {
                    continue;
                };
                let Some((field_label, field_ty)) = r.fields.get_with_label(field_name) else {
                    continue;
                };
                match (&**field_ty, &*ob_ty) {
                    (BaseTyS_::Over(_), BaseTyV_::Over(path)) => {
                        specializations.push((
                            vec![(field_name, *field_label)],
                            BaseTyS::sing(BaseTyS::over(path.clone()), ob_s),
                        ));
                        r = r.add_specialization(
                            &[(field_name, *field_label)],
                            BaseTyV::sing(BaseTyV::over(path.clone()), ob_v),
                        );
                    }
                    _ => continue,
                }
            }
        }
        let ty_s = if specializations.is_empty() {
            BaseTyS::topvar(topname)
        } else {
            BaseTyS::specialize(BaseTyS::topvar(topname), specializations)
        };
        (ty_s, BaseTyV::record(r))
    }

    fn diag_instantiation_cell(
        &mut self,
        i_decl: &nb::InstantiatedDiagram,
    ) -> (NameSegment, LabelSegment, BaseTyS, BaseTyV) {
        let name = NameSegment::Uuid(i_decl.id);
        let label = LabelSegment::Text(ustr(&i_decl.name));
        let (ty_s, ty_v) = self.diag_instantiation_cell_ty(i_decl);
        (name, label, ty_s, ty_v)
    }

    /// Elaborates diagram and its accompanying model into a quadruple
    ///
    /// (Instance Term Syntax, Instance Term Value, Record Type Syntax, Record Type Value)
    pub fn diagram_notebook<'b>(
        &mut self,
        model: BaseTyV,
        cells: impl Iterator<Item = &'b nb::DiagramJudgment>,
    ) -> (BaseTmS, BaseTmV, BaseTyS, BaseTyV) {
        let BaseTyV_::Record(r) = &*model else {
            panic!()
        };

        // Process the cells in dependency order. This is important because the
        // UI allows users to reorder cells freely and that shouldn't affect the
        // result of elaboration.
        let mut cells: Vec<_> = cells.collect();
        cells.sort_by_key(|judgment| match judgment {
            nb::DiagramJudgment::Object(_) => 0,
            nb::DiagramJudgment::Instantiation(_) => 1,
            nb::DiagramJudgment::Morphism(_) => 2,
            nb::DiagramJudgment::Equation(_) => 3,
        });

        let mut field_ty_vs = Vec::new();

        // for instances
        let mut generators: IndexMap<FieldName, (LabelSegment, Vec<(FieldName, LabelSegment)>)> =
            IndexMap::new();

        let mut eqns_s: Vec<(BaseTmS, BaseTmS)> = Vec::new();
        let mut eqns_v: Vec<(BaseTmV, BaseTmV)> = Vec::new();
        let mut subs_s: IndexMap<FieldName, (LabelSegment, BaseTmS)> = IndexMap::new();
        let mut subs_v: IndexMap<FieldName, (LabelSegment, BaseTmV)> = IndexMap::new();

        let self_var = self.intro(name_seg("self"), label_seg("self"), None).unwrap_neu();
        let c = self.checkpoint();

        for cell in cells {
            let (name, label, _, ty_v) = match &cell {
                nb::DiagramJudgment::Object(ob_decl) => {
                    let result = self.diag_object_cell(r, ob_decl);
                    if let BaseTyV_::Over(path) = &*result.3 {
                        generators.insert(result.0, (result.1, path.clone()));
                    }
                    result
                }
                nb::DiagramJudgment::Morphism(mor_decl) => {
                    let (name, label, ty_s, ty_v, mor_eqns_s, mor_eqns_v) =
                        self.diag_morphism_cell(r, mor_decl);
                    eqns_s.extend(mor_eqns_s);
                    eqns_v.extend(mor_eqns_v);
                    (name, label, ty_s, ty_v)
                }
                nb::DiagramJudgment::Instantiation(i_decl) => {
                    let result = self.diag_instantiation_cell(i_decl);
                    if let Some(link) = &i_decl.diagram {
                        let ref_id = ustr(&link.stable_ref.id);
                        let topname = NameSegment::Text(ref_id);
                        if let Some(TopDecl::Diag(d)) = self.toplevel.declarations.get(&topname) {
                            subs_s.insert(result.0, (result.1, d.body_stx.clone()));
                            subs_v.insert(result.0, (result.1, d.body_val.clone()));
                        }
                    }
                    result
                }
                nb::DiagramJudgment::Equation(_) => todo!(),
            };
            field_ty_vs.push((name, (label, ty_v.clone())));
            self.ctx.scope.push(VarInContext::new(name, label, Some(ty_v.clone())));
            self.ctx.env =
                self.ctx.env.snoc(BaseTmV::neu(TmN::proj(self_var.clone(), name, label), ty_v));
        }

        self.reset_to(c);
        let field_tys: Row<_> = field_ty_vs
            .iter()
            .map(|(name, (label, ty_v))| (*name, (*label, self.evaluator().quote_ty(ty_v))))
            .collect();

        let body_s = InstanceBodyS {
            generators: generators.clone(),
            equations: eqns_s,
            sub_instances: subs_s,
        };
        let body_v = InstanceBodyV {
            generators: generators,
            equations: eqns_v,
            sub_instances: subs_v,
        };

        let r_v = RecordV::new(self.ctx.env.clone(), field_tys.clone(), Dtry::empty());
        (
            BaseTmS::instance(body_s),
            BaseTmV::instance(body_v),
            BaseTyS::record(field_tys),
            BaseTyV::record(r_v),
        )
    }
}

/// Instance-notebook elaboration: cells presenting an instance of a model,
/// elaborated to a fiber record packaged as an [`Instance`] — the
/// same target as the text elaborator's `instance NAME : X := [...]` path,
/// whose `instance_body_inner` is the blueprint for everything here. The
/// fiber helpers are deliberate near-duplicates of their text-side namesakes
/// with typed errors; extracting a shared core is planned once the error
/// channels unify.
impl<'a> Elaborator<'a> {
    /// Reserved name binding the codomain model in an instance notebook.
    ///
    /// Kept identical to the text elaborator's private `CODOMAIN_BINDER`:
    /// both pipelines bind the codomain first in an empty context, so fiber
    /// values from either root at the same de Bruijn level, and the shared
    /// name keeps their display consistent. Cell names are UUIDs, so the
    /// binder can never be shadowed.
    const CODOMAIN_BINDER: &'static str = "instance self";

    /// Introduce a fiber variable (a generator or import) into the fiber
    /// scope, returning its neutral value.
    fn intro_fiber(&mut self, name: VarName, label: LabelSegment, ty: FiberTyV) -> FiberTmV {
        let v = FiberTmV::var(self.ctx.fiber_scope.len().into(), name, label);
        self.ctx.fiber_env = self.ctx.fiber_env.snoc(v.clone());
        self.ctx.push_fiber(name, label, ty);
        v
    }

    /// Look up a fiber variable by name, returning its syntax, value, and
    /// fiber type.
    fn lookup_fiber_tm(&self, name: VarName) -> Option<(FiberTmS, FiberTmV, FiberTyV)> {
        let (i, label, ty) = self.ctx.lookup_fiber(name)?;
        Some((FiberTmS::var(i, name, label), self.ctx.fiber_env.get(*i).unwrap().clone(), ty))
    }

    fn fiber_syn_hole(&mut self) -> (FiberTmS, FiberTmV, FiberTyV) {
        let tm_m = self.fresh_meta();
        let obj_m = self.fresh_meta();
        (FiberTmS::meta(tm_m), FiberTmV::meta(tm_m), FiberTyV::over(BaseTmV::meta(obj_m)))
    }

    fn fiber_syn_error(&mut self, error: InvalidDblModel) -> (FiberTmS, FiberTmV, FiberTyV) {
        self.errors.push(error);
        self.fiber_syn_hole()
    }

    fn fiber_chk_error(&mut self, error: InvalidDblModel) -> (FiberTmS, FiberTmV) {
        self.errors.push(error);
        let tm_m = self.fresh_meta();
        (FiberTmS::meta(tm_m), FiberTmV::meta(tm_m))
    }

    /// Whether two codomain models agree closely enough to import an
    /// instance of one into an instance of the other. Duplicates the text
    /// elaborator's `codomains_match`; see there for why this is stricter
    /// than record convertibility.
    fn codomains_match(&self, a: &BaseTyV, b: &BaseTyV) -> bool {
        if let (BaseTyV_::Record(r1), BaseTyV_::Record(r2)) = (&**a, &**b) {
            let names_a: Vec<_> = r1.fields.iter().map(|(n, _)| n).collect();
            let names_b: Vec<_> = r2.fields.iter().map(|(n, _)| n).collect();
            if names_a != names_b {
                return false;
            }
        }
        self.evaluator().convertible_ty(a, b).is_ok()
    }

    /// Resolve a qualified name to a codomain morphism: the path (with
    /// labels, for [`FiberTmS::over_app`]) and the morphism's type. The
    /// codomain's fields are in the base scope (see
    /// [`Self::instance_notebook`]), so the first segment is a context
    /// variable and later segments project through records (a morphism of a
    /// model instantiated into the codomain).
    fn resolve_codomain_mor(
        &self,
        name: &QualifiedName,
    ) -> Option<(Vec<(FieldName, LabelSegment)>, BaseTyV)> {
        let (&first, rest) = name.as_slice().split_first()?;
        let (i, label, ty) = self.ctx.lookup(first)?;
        let mut tm_v = self.ctx.env.get(*i).unwrap().clone();
        let mut ty_v = ty?;
        let mut path = vec![(first, label)];
        for &seg in rest {
            let BaseTyV_::Record(r) = &*ty_v else {
                return None;
            };
            let (seg_label, _) = r.fields.get_with_label(seg)?;
            path.push((seg, *seg_label));
            let next_ty = self.evaluator().field_ty(&ty_v, &tm_v, seg);
            tm_v = self.evaluator().proj(&tm_v, seg, *seg_label);
            ty_v = next_ty;
        }
        Some((path, ty_v))
    }

    /// Resolve a qualified fiber reference: a generator, or a projection
    /// path through imports (`hydro.n`). The fiber-scope analogue of
    /// [`Self::resolve_name`].
    fn resolve_fiber(&self, segments: &[VarName]) -> Option<(FiberTmS, FiberTmV, FiberTyV)> {
        let (&first, rest) = segments.split_first()?;
        let (mut tm_s, mut tm_v, mut ty_v) = self.lookup_fiber_tm(first)?;
        for &seg in rest {
            let FiberTyV_::Record(r) = &*ty_v else {
                return None;
            };
            let (label, field_ty) = r.get_with_label(seg)?;
            tm_s = FiberTmS::proj(tm_s, seg, *label);
            tm_v = FiberTmV::proj(tm_v, seg, *label);
            ty_v = field_ty.clone();
        }
        Some((tm_s, tm_v, ty_v))
    }

    /// Apply a codomain morphism to an already-elaborated fiber argument.
    /// Duplicates the text elaborator's `apply_codomain_morphism` with typed
    /// errors: the argument's `Over` object must equal the morphism's domain
    /// object (compared as base objects, so modal domains need no special
    /// handling); the result lies over the morphism's codomain object.
    fn apply_codomain_morphism(
        &mut self,
        cell: &QualifiedName,
        mor_name: &QualifiedName,
        arg_s: FiberTmS,
        arg_v: FiberTmV,
        arg_ty: FiberTyV,
    ) -> (FiberTmS, FiberTmV, FiberTyV) {
        let Some((path, mor_ty)) = self.resolve_codomain_mor(mor_name) else {
            return self.fiber_syn_error(InvalidDblModel::FiberElement(cell.clone()));
        };
        let FiberTyV_::Over(arg_obj) = &*arg_ty else {
            return self.fiber_syn_error(InvalidDblModel::FiberType(cell.clone()));
        };
        let arg_obj = arg_obj.clone();
        let BaseTyV_::Morphism(_, dom_obj, cod_obj) = &*mor_ty else {
            return self.fiber_syn_error(InvalidDblModel::FiberType(cell.clone()));
        };
        if self.evaluator().equal_tm(&arg_obj, dom_obj).is_err() {
            return self.fiber_syn_error(InvalidDblModel::FiberType(cell.clone()));
        }
        let cod_s = self.evaluator().quote_tm(cod_obj);
        (
            FiberTmS::over_app(path.clone(), cod_s, arg_s),
            FiberTmV::over_app(path, cod_obj.clone(), arg_v),
            FiberTyV::over(cod_obj.clone()),
        )
    }

    /// Synthesize a fiber term from a notebook instance term. Mirrors the
    /// text elaborator's `fiber_syn`, dispatching on [`nb::InstanceTm`]
    /// instead of surface notation. `cell` names the enclosing equation cell
    /// for error attribution.
    fn fiber_syn_nb(
        &mut self,
        cell: &QualifiedName,
        tm: &nb::InstanceTm,
    ) -> (FiberTmS, FiberTmV, FiberTyV) {
        match tm {
            nb::InstanceTm::Generator(name) => {
                let Ok(qname) = QualifiedName::deserialize_str(name) else {
                    return self.fiber_syn_error(InvalidDblModel::FiberElement(cell.clone()));
                };
                match self.resolve_fiber(qname.as_slice()) {
                    Some(r) => r,
                    None => self.fiber_syn_error(InvalidDblModel::FiberElement(cell.clone())),
                }
            }
            nb::InstanceTm::App { mor, arg } => {
                let nb::Mor::Basic(mor_name) = mor else {
                    return self.fiber_syn_error(InvalidDblModel::UnsupportedFeature(
                        Feature::CompositeApplication,
                    ));
                };
                let Ok(mor_qname) = QualifiedName::deserialize_str(mor_name) else {
                    return self.fiber_syn_error(InvalidDblModel::FiberElement(cell.clone()));
                };
                let (arg_s, arg_v, arg_ty) = self.fiber_syn_nb(cell, arg);
                self.apply_codomain_morphism(cell, &mor_qname, arg_s, arg_v, arg_ty)
            }
            nb::InstanceTm::List { terms, .. } => {
                let mut ss = Vec::with_capacity(terms.len());
                let mut vs = Vec::with_capacity(terms.len());
                let mut objs = Vec::with_capacity(terms.len());
                for term in terms {
                    let Some(term) = term else {
                        return self.fiber_syn_error(InvalidDblModel::FiberElement(cell.clone()));
                    };
                    let (s, v, ty) = self.fiber_syn_nb(cell, term);
                    let FiberTyV_::Over(o) = &*ty else {
                        return self.fiber_syn_error(InvalidDblModel::FiberType(cell.clone()));
                    };
                    objs.push(o.clone());
                    ss.push(s);
                    vs.push(v);
                }
                (FiberTmS::list(ss), FiberTmV::list(vs), FiberTyV::over(BaseTmV::list(objs)))
            }
            nb::InstanceTm::ObApp { op, tm } => {
                let nb::ObOp::Basic(op_name) = op;
                let op_seg = name_seg(*op_name);
                if self.theory().basic_ob_op([op_seg].into()).is_none() {
                    return self.fiber_syn_error(InvalidDblModel::FiberType(cell.clone()));
                }
                let (arg_s, arg_v, arg_ty) = self.fiber_syn_nb(cell, tm);
                let FiberTyV_::Over(arg_obj) = &*arg_ty else {
                    return self.fiber_syn_error(InvalidDblModel::FiberType(cell.clone()));
                };
                let obj = BaseTmV::app(op_seg, arg_obj.clone());
                (
                    FiberTmS::ob_app(op_seg, arg_s),
                    FiberTmV::ob_app(op_seg, arg_v),
                    FiberTyV::over(obj),
                )
            }
        }
    }

    /// Check a notebook instance term against an expected fiber type. Fiber
    /// terms are all synthesizing, so this synthesizes and checks
    /// convertibility.
    fn fiber_chk_nb(
        &mut self,
        cell: &QualifiedName,
        expected: &FiberTyV,
        tm: &nb::InstanceTm,
    ) -> (FiberTmS, FiberTmV) {
        let (s, v, ty) = self.fiber_syn_nb(cell, tm);
        if self.evaluator().convertible_fiber_ty(&ty, expected).is_err() {
            return self.fiber_chk_error(InvalidDblModel::FiberType(cell.clone()));
        }
        (s, v)
    }

    /// Elaborate the cells of an instance notebook against the codomain
    /// model, producing the instance as a fiber record — the notebook
    /// analogue of the text elaborator's `instance_body`.
    ///
    /// The codomain is bound under `Self::CODOMAIN_BINDER` and each of its
    /// fields is pushed into the base scope as a variable projecting out of
    /// that binding, so cell references to codomain objects and morphisms
    /// (UUID-qualified names) resolve through the ordinary
    /// `Self::resolve_name` machinery — including modal objects in `over`
    /// and paths through model instantiations. Generators and imports go to
    /// the separate fiber scope, exactly as in the text pipeline. Unlike the
    /// text pipeline, a bad cell does not abort the instance: the error is
    /// recorded against the cell and elaboration continues.
    pub fn instance_notebook<'b>(
        &mut self,
        codomain: &RecordV,
        cells: impl Iterator<Item = &'b nb::InstanceJudgment>,
    ) -> (FiberTyS, FiberTyV) {
        let toplevel = self.toplevel;
        // Like model notebooks, cells are elaborated in dependency order so
        // that UI reordering cannot change the result.
        let mut cells: Vec<_> = cells.collect();
        cells.sort_by_key(|judgment| match judgment {
            nb::InstanceJudgment::Generator(_) => 0,
            nb::InstanceJudgment::Import(_) => 1,
            nb::InstanceJudgment::Equation(_) => 2,
        });

        let c = self.checkpoint();
        let codomain_ty = BaseTyV::record(codomain.clone());
        let self_v = self.intro(
            name_seg(Self::CODOMAIN_BINDER),
            label_seg(Self::CODOMAIN_BINDER),
            Some(codomain_ty.clone()),
        );
        for (name, (label, _)) in codomain.fields.iter() {
            let field_ty = self.evaluator().field_ty(&codomain_ty, &self_v, *name);
            let field_v = self.evaluator().proj(&self_v, *name, *label);
            self.ctx.push_scope(*name, *label, Some(field_ty));
            self.ctx.env = self.ctx.env.snoc(field_v);
        }

        let mut fields_s: Row<FiberTyS> = Row::empty();
        let mut fields_v: Row<FiberTyV> = Row::empty();

        for cell in cells {
            match cell {
                // A generator lying over a codomain object.
                nb::InstanceJudgment::Generator(gen_decl) => {
                    let name = NameSegment::Uuid(gen_decl.id);
                    let label = LabelSegment::Text(ustr(&gen_decl.name));
                    let over = gen_decl.over.as_ref().and_then(|ob| self.ob_syn(ob));
                    let (ty_s, ty_v) = match over {
                        Some((obj_s, obj_v, _)) => (FiberTyS::over(obj_s), FiberTyV::over(obj_v)),
                        None => {
                            self.errors.push(InvalidDblModel::ObType(QualifiedName::single(name)));
                            let m = self.fresh_meta();
                            (FiberTyS::over(BaseTmS::meta(m)), FiberTyV::over(BaseTmV::meta(m)))
                        }
                    };
                    self.intro_fiber(name, label, ty_v.clone());
                    fields_s.insert(name, label, ty_s);
                    fields_v.insert(name, label, ty_v);
                }
                // An import of another instance of the same codomain.
                nb::InstanceJudgment::Import(import) => {
                    let name = NameSegment::Uuid(import.id);
                    let label = LabelSegment::Text(ustr(&import.name));
                    let qname = QualifiedName::single(name);
                    let resolved = import.instance.as_ref().and_then(|link| {
                        let nb::LinkType::Instantiation = link.r#type else {
                            return None;
                        };
                        let topname = NameSegment::Text(ustr(&link.stable_ref.id));
                        match toplevel.declarations.get(&topname) {
                            Some(TopDecl::Instance(inst)) if inst.theory == self.theory => {
                                Some((topname, inst))
                            }
                            _ => None,
                        }
                    });
                    let Some((topname, inst)) = resolved else {
                        self.errors.push(InvalidDblModel::InvalidLink(qname));
                        continue;
                    };
                    if !self.codomains_match(&codomain_ty, &inst.codomain) {
                        self.errors.push(InvalidDblModel::ImportCodomain(qname));
                        continue;
                    }
                    let val = inst.val.clone();
                    self.intro_fiber(name, label, val.clone());
                    fields_s.insert(name, label, FiberTyS::topvar(topname));
                    fields_v.insert(name, label, val);
                }
                // An equation between fiber elements.
                nb::InstanceJudgment::Equation(eqn_decl) => {
                    let name = NameSegment::Uuid(eqn_decl.id);
                    let label = LabelSegment::Text(ustr(&eqn_decl.name));
                    let qname = QualifiedName::single(name);
                    let (Some(lhs), Some(rhs)) = (&eqn_decl.lhs, &eqn_decl.rhs) else {
                        self.errors
                            .push(InvalidDblModel::UnsupportedFeature(Feature::PartialEquation));
                        continue;
                    };
                    let (lhs_s, lhs_v, lhs_ty) = self.fiber_syn_nb(&qname, lhs);
                    let FiberTyV_::Over(obj) = &*lhs_ty else {
                        // Only fiber-element equations live in an instance;
                        // morphism equations constrain the model.
                        self.errors.push(InvalidDblModel::FiberType(qname));
                        continue;
                    };
                    let over_s = FiberTyS::over(self.evaluator().quote_tm(obj));
                    let (rhs_s, rhs_v) = self.fiber_chk_nb(&qname, &lhs_ty, rhs);
                    fields_s.insert(name, label, FiberTyS::id(over_s, lhs_s, rhs_s));
                    fields_v.insert(name, label, FiberTyV::id(lhs_ty.clone(), lhs_v, rhs_v));
                }
            }
        }
        self.reset_to(c);
        (FiberTyS::record(fields_s), FiberTyV::record(fields_v))
    }

    /// Elaborate an instance document into a top-level instance declaration.
    ///
    /// Resolves the document's `instanceOf` link to a model previously
    /// declared in the toplevel (mirroring how instantiation cells resolve
    /// their links), elaborates the cells against it, and packages the
    /// result exactly as the text pipeline does — ready for
    /// [`instance_from_def`](super::modelgen::instance_from_def).
    ///
    /// Returns `None` (with an error recorded) if the codomain link cannot
    /// be resolved at all; cell-level problems are recorded per-cell in
    /// [`Self::errors`] and still produce an instance.
    pub fn instance_document(&mut self, doc: &nb::InstanceDocumentContent) -> Option<Instance> {
        let toplevel = self.toplevel;
        let link = &doc.instance_of;
        let link_name = QualifiedName::single(NameSegment::Text(ustr(&link.stable_ref.id)));
        let nb::LinkType::InstanceOf = link.r#type else {
            self.errors.push(InvalidDblModel::InvalidLink(link_name));
            return None;
        };
        let topname = NameSegment::Text(ustr(&link.stable_ref.id));
        let Some(TopDecl::Type(type_def)) = toplevel.declarations.get(&topname) else {
            self.errors.push(InvalidDblModel::InvalidLink(link_name));
            return None;
        };
        if type_def.theory != self.theory {
            self.errors.push(InvalidDblModel::InvalidLink(link_name));
            return None;
        }
        let BaseTyV_::Record(codomain) = &*type_def.val else {
            self.errors.push(InvalidDblModel::InvalidLink(link_name));
            return None;
        };
        let codomain = codomain.clone();
        let codomain_ty = type_def.val.clone();
        let (stx, val) = self.instance_notebook(&codomain, doc.notebook.formal_content());
        Some(Instance::new(self.theory.clone(), stx, val, codomain_ty))
    }
}

/// Promotes a modality from notebook type to modality for modal theory.
pub fn promote_modality(modality: nb::Modality) -> modal::Modality {
    match modality {
        nb::Modality::Discrete => modal::Modality::Discrete(),
        nb::Modality::Codiscrete => modal::Modality::Codiscrete(),
        nb::Modality::List => modal::Modality::List(modal::List::Plain),
        nb::Modality::SymmetricList => modal::Modality::List(modal::List::Symmetric),
        nb::Modality::CartesianList => modal::Modality::List(modal::List::Cartesian),
        nb::Modality::CocartesianList => modal::Modality::List(modal::List::Cocartesian),
        nb::Modality::AdditiveList => modal::Modality::List(modal::List::Additive),
    }
}

/// Demotes a modality to notebook type.
pub fn demote_modality(modality: modal::Modality) -> nb::Modality {
    match modality {
        modal::Modality::Discrete() => nb::Modality::Discrete,
        modal::Modality::Codiscrete() => nb::Modality::Codiscrete,
        modal::Modality::List(list_type) => match list_type {
            modal::List::Plain => nb::Modality::List,
            modal::List::Symmetric => nb::Modality::SymmetricList,
            modal::List::Cartesian => nb::Modality::CartesianList,
            modal::List::Cocartesian => nb::Modality::CocartesianList,
            modal::List::Additive => nb::Modality::AdditiveList,
        },
    }
}

#[cfg(test)]
mod test {
    use expect_test::{Expect, expect};
    use serde_json;
    use std::{fmt::Write, fs};
    use ustr::ustr;

    use crate::dbl::model::DblModelPrinter;
    use crate::stdlib::{th_schema, th_sym_multicategory};
    use crate::stdlib::{th_multicategory, th_schema, th_sym_monoidal_category};
    use crate::tt::toplevel::{Diag, TopDecl};
    use crate::tt::util::{Decapodes, JuliaTranspiler};
    use crate::tt::{
        batch::{format_modal_instance_term, format_modal_ob, write_instance_summary},
        modelgen::{Model, ModelInstance, instance_from_def},
        notebook_elab::Elaborator,
        prelude::*,
        theory::{Theory, TheoryDef},
        toplevel::{Instance, TopDecl, Toplevel, Type},
    };
    use crate::zero::name;
    use catcolab_document_types::current::{InstanceDocumentContent, ModelDocumentContent};
    use crate::zero::{NameSegment, name};

    fn elab_example(theory: &Theory, name: &str, expected: Expect) -> Model {
        let src = fs::read_to_string(format!("examples/tt/notebook/{name}.json")).unwrap();
        let doc: ModelDocumentContent = serde_json::from_str(&src).unwrap();
        let toplevel = Toplevel::new(Default::default());
        let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));
        let (_, ty_v) = elab.notebook(doc.notebook.formal_content());
        let (model, ns) = Model::from_ty(&toplevel, &theory.definition, &ty_v);
        let mut out = model.to_doc(&DblModelPrinter::new(), &ns).pretty().to_string();
        for error in elab.errors() {
            writeln!(&mut out, "error {:?}", error).unwrap()
        }
        expected.assert_eq(&out);
        model
    }

    #[test]
    fn discrete_theories() {
        let th_schema = Theory::new(name("ThSchema"), TheoryDef::discrete(th_schema()));
        elab_example(
            &th_schema,
            "sch_weighted_graph",
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

    #[test]
    fn modal_theories() {
        let th_smc =
            Theory::new(name("ThSMC"), TheoryDef::modal_unital(th_sym_monoidal_category()));
        elab_example(
            &th_smc,
            "sir_petri",
            expect![[r#"
                model generated by 3 objects and 2 morphisms
                S : Object
                I : Object
                R : Object
                infect : ⨂ [S, I] -> ⨂ [I, I] : Hom Object
                recover : ⨂ [I] -> ⨂ [R] : Hom Object"#]],
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

    /// Every notebook fixture under `examples/tt/notebook` deserializes
    /// against the document schema for its declared `type`. Elaboration
    /// coverage is per-file opt-in (each fixture needs a theory and, for
    /// instances, a populated toplevel), but this sweep catches schema
    /// drift and orphaned fixtures that no named test reads.
    #[test]
    fn notebook_fixtures_deserialize() {
        fn walk(dir: &std::path::Path, checked: &mut usize) {
            for entry in fs::read_dir(dir).unwrap().flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, checked);
                    continue;
                }
                if path.extension().is_none_or(|e| e != "json") {
                    continue;
                }
                let src = fs::read_to_string(&path).unwrap();
                let value: serde_json::Value = serde_json::from_str(&src).unwrap();
                let display = path.display();
                match value.get("type").and_then(|t| t.as_str()) {
                    Some("model") => {
                        serde_json::from_str::<ModelDocumentContent>(&src)
                            .unwrap_or_else(|e| panic!("{display}: {e}"));
                    }
                    Some("instance") => {
                        serde_json::from_str::<InstanceDocumentContent>(&src)
                            .unwrap_or_else(|e| panic!("{display}: {e}"));
                    }
                    other => panic!("{display}: unexpected document type {other:?}"),
                }
                *checked += 1;
            }
        }
        let mut checked = 0;
        walk(std::path::Path::new("examples/tt/notebook"), &mut checked);
        assert!(checked >= 8, "expected at least 8 fixtures, found {checked}");
    }

    /// Elaborate a model document and install it in the toplevel under the
    /// given ref id, so instance documents can link to it.
    fn install_model(toplevel: &mut Toplevel, theory: &Theory, ref_id: &str, src: &str) {
        let doc: ModelDocumentContent = serde_json::from_str(src).unwrap();
        let (ty_s, ty_v) = {
            let mut elab = Elaborator::new(theory.clone(), toplevel, ustr(ref_id));
            let r = elab.notebook(doc.notebook.formal_content());
            assert!(elab.errors().is_empty(), "{ref_id}: {:?}", elab.errors());
            r
        };
        toplevel.declarations.insert(
            NameSegment::Text(ustr(ref_id)),
            TopDecl::Type(Type::new(theory.clone(), ty_s, ty_v)),
        );
    }

    /// Elaborate an instance document, asserting no errors.
    fn elab_instance(toplevel: &Toplevel, theory: &Theory, ref_id: &str, src: &str) -> Instance {
        let doc: InstanceDocumentContent = serde_json::from_str(src).unwrap();
        let mut elab = Elaborator::new(theory.clone(), toplevel, ustr(ref_id));
        let inst = elab.instance_document(&doc).expect("codomain should resolve");
        assert!(elab.errors().is_empty(), "{ref_id}: {:?}", elab.errors());
        inst
    }

    /// The Klausmeier fixtures: DEC model + hydro/phyto instances installed
    /// in a toplevel, ready for tests to elaborate against.
    fn klausmeier_setup() -> (Theory, Toplevel) {
        let th =
            Theory::new(name("ThMulticategory"), TheoryDef::modal_unital(th_sym_multicategory()));
        let mut toplevel = Toplevel::new(Default::default());
        let src = fs::read_to_string("examples/tt/notebook/klausmeier/dec_model.json").unwrap();
        install_model(&mut toplevel, &th, "dec_model", &src);
        for ref_id in ["hydrodynamics", "phytodynamics"] {
            let src = fs::read_to_string(format!("examples/tt/notebook/klausmeier/{ref_id}.json"))
                .unwrap();
            let inst = elab_instance(&toplevel, &th, ref_id, &src);
            toplevel
                .declarations
                .insert(NameSegment::Text(ustr(ref_id)), TopDecl::Instance(inst));
        }
        (th, toplevel)
    }

    /// Render an elaborated instance through `instance_from_def` in the
    /// batch snapshot format.
    fn instance_summary(toplevel: &Toplevel, theory: &Theory, inst: &Instance) -> String {
        let (instance, ns) = instance_from_def(toplevel, &theory.definition, inst).unwrap();
        let ModelInstance::ModalUnital(instance) = &instance else {
            panic!("expected a modal instance");
        };
        let mut out = String::new();
        write_instance_summary(
            &mut out,
            instance,
            &ns,
            |ob| format_modal_ob(ob, &ns),
            |tm| format_modal_instance_term(tm, &ns),
        );
        out
    }

    /// End-to-end: the Klausmeier instance notebooks elaborate to
    /// `DblModelInstance`s through the same pipeline as the text examples
    /// (compare `examples/tt/text/test_klausmeier.dbltt.snapshot`).
    #[test]
    fn klausmeier_instance_notebooks() {
        let (th, toplevel) = klausmeier_setup();

        let Some(TopDecl::Instance(hydro)) =
            toplevel.declarations.get(&NameSegment::Text(ustr("hydrodynamics")))
        else {
            unreachable!()
        };
        expect![[r#"
            #/ instance generators:
            #/   a : Form0
            #/   k : Form0
            #/   dX : Form1
            #/   w : DualForm0
            #/   n : DualForm0
            #/   x0 : DualForm0
            #/   x1 : DualForm0
            #/   x2 : DualForm0
            #/   x3 : DualForm0
            #/   x4 : DualForm0
            #/   x5 : DualForm0
            #/ instance equations:
            #/   x0 == sub_d01([w, a])
            #/   x1 == square_d0([n])
            #/   x2 == mult_d0d0([w, x1])
            #/   x3 == sub_d0d0([x0, x2])
            #/   x4 == lie_1d0([dX, w])
            #/   x5 == mult_0d0([k, x4])
            #/   partial_d0([w]) == add_d0d0([x3, x5])
        "#]]
        .assert_eq(&instance_summary(&toplevel, &th, hydro));

        let src = fs::read_to_string("examples/tt/notebook/klausmeier/klausmeier.json").unwrap();
        let klausmeier = elab_instance(&toplevel, &th, "klausmeier", &src);
        expect![[r#"
            #/ instance generators:
            #/   hydro.a : Form0
            #/   hydro.k : Form0
            #/   hydro.dX : Form1
            #/   hydro.w : DualForm0
            #/   hydro.n : DualForm0
            #/   hydro.x0 : DualForm0
            #/   hydro.x1 : DualForm0
            #/   hydro.x2 : DualForm0
            #/   hydro.x3 : DualForm0
            #/   hydro.x4 : DualForm0
            #/   hydro.x5 : DualForm0
            #/   phyto.m : Form0
            #/   phyto.n : DualForm0
            #/   phyto.w : DualForm0
            #/   phyto.y0 : DualForm0
            #/   phyto.y1 : DualForm0
            #/   phyto.y2 : DualForm0
            #/   phyto.y3 : DualForm0
            #/   phyto.y4 : DualForm0
            #/ instance equations:
            #/   hydro.x0 == sub_d01([hydro.w, hydro.a])
            #/   hydro.x1 == square_d0([hydro.n])
            #/   hydro.x2 == mult_d0d0([hydro.w, hydro.x1])
            #/   hydro.x3 == sub_d0d0([hydro.x0, hydro.x2])
            #/   hydro.x4 == lie_1d0([hydro.dX, hydro.w])
            #/   hydro.x5 == mult_0d0([hydro.k, hydro.x4])
            #/   partial_d0([hydro.w]) == add_d0d0([hydro.x3, hydro.x5])
            #/   phyto.y0 == square_d0([phyto.n])
            #/   phyto.y1 == mult_d0d0([phyto.w, phyto.y0])
            #/   phyto.y2 == mult_0d0([phyto.m, phyto.n])
            #/   phyto.y3 == sub_d0d0([phyto.y1, phyto.y2])
            #/   phyto.y4 == lapl_d0([phyto.n])
            #/   partial_d0([phyto.w]) == add_d0d0([phyto.y3, phyto.y4])
            #/   hydro.n == phyto.n
            #/   hydro.w == phyto.w
        "#]]
        .assert_eq(&instance_summary(&toplevel, &th, &klausmeier));
    }

    /// Importing an instance of a different model into an instance notebook
    /// is an error (notebook twin of the text suite's MismatchedImport).
    #[test]
    fn instance_import_codomain_mismatch() {
        use crate::dbl::model::InvalidDblModel;
        let (th, mut toplevel) = klausmeier_setup();
        let other_model = r##"{"type":"model","name":"Other","theory":"multicategory","version":"2",
            "notebook":{"cellContents":{"11111111-1111-1111-1111-111111111111":{
                "tag":"formal","id":"11111111-1111-1111-1111-111111111111",
                "content":{"tag":"object","name":"X","id":"22222222-2222-2222-2222-222222222222",
                    "obType":{"tag":"Basic","content":"Object"}}}},
                "cellOrder":["11111111-1111-1111-1111-111111111111"]}}"##;
        install_model(&mut toplevel, &th, "other_model", other_model);
        let bad_import = r##"{"type":"instance","name":"Bad","version":"2",
            "instanceOf":{"_id":"other_model","_version":null,"_server":"catcolab.org","type":"instance-of"},
            "notebook":{"cellContents":{"33333333-3333-3333-3333-333333333333":{
                "tag":"formal","id":"33333333-3333-3333-3333-333333333333",
                "content":{"tag":"import","name":"h","id":"44444444-4444-4444-4444-444444444444",
                    "instance":{"_id":"hydrodynamics","_version":null,"_server":"catcolab.org","type":"instantiation"}}}},
                "cellOrder":["33333333-3333-3333-3333-333333333333"]}}"##;
        let doc: InstanceDocumentContent = serde_json::from_str(bad_import).unwrap();
        let mut elab = Elaborator::new(th.clone(), &toplevel, ustr("bad_import"));
        let inst = elab.instance_document(&doc);
        assert!(inst.is_some());
        assert!(
            elab.errors().iter().any(|e| matches!(e, InvalidDblModel::ImportCodomain(_))),
            "expected an ImportCodomain error, got {:?}",
            elab.errors()
        );
    }

    /// Test a notebook with an equation.
    #[test]
    fn commutative_square() {
        let th_schema = Theory::new(name("ThSchema"), TheoryDef::discrete(th_schema()));
        let model = elab_example(
            &th_schema,
            "commutative_square",
            expect![[r#"
                model generated by 4 objects and 4 morphisms
                NW : Entity
                NE : Entity
                SW : Entity
                SE : Entity
                t : NW -> NE : Hom Entity
                l : NW -> SW : Hom Entity
                r : NE -> SE : Hom Entity
                b : SW -> SE : Hom Entity
                t ⋅ r = l ⋅ b : (Hom Entity)[NW, SE]"#]],
        );
        let model = model.as_discrete().unwrap();
        let eqns: Vec<_> = model.category.equations().collect();
        assert_eq!(eqns.len(), 1);
    }

    #[test]
    fn glueing_modal_instances() {
        let theory =
            Theory::new(name("ThMulticategory"), TheoryDef::modal_unital(th_multicategory()));
        let mut toplevel = Toplevel::new(Default::default());
        let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));

        let src =
            fs::read_to_string("examples/tt/notebook/klausmeier/model_dec_fragment.json").unwrap();
        let doc: ModelDocumentContent = serde_json::from_str(&src).unwrap();
        let (_, model_ty_v) = elab.notebook(doc.notebook.formal_content());

        let hydro_src =
            fs::read_to_string(format!("examples/tt/notebook/klausmeier/hydrodynamics.json"))
                .unwrap();
        let hydro_doc: DiagramDocumentContent = serde_json::from_str(&hydro_src).unwrap();
        let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));

        let hydro_doc_id = "019eb37e-eb26-7283-8c68-63d4cb8cd1f7"; // from Klausmeier.json
        let (hydro_stx, hydro_val, _, hydro_ty) =
            elab.diagram_notebook(model_ty_v.clone(), hydro_doc.notebook.formal_content());
        toplevel.declarations.insert(
            NameSegment::Text(ustr(hydro_doc_id)),
            TopDecl::Diag(Diag::new(
                theory.clone(),
                model_ty_v.clone(),
                hydro_stx,
                hydro_val,
                hydro_ty,
            )),
        );

        let phyto_src =
            fs::read_to_string(format!("examples/tt/notebook/klausmeier/phytodynamics.json"))
                .unwrap();
        let phyto_doc: DiagramDocumentContent = serde_json::from_str(&phyto_src).unwrap();
        let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));

        let phyto_doc_id = "019eb288-c310-7f33-b2c3-171279589942";
        let (phyto_stx, phyto_val, _, phyto_ty) =
            elab.diagram_notebook(model_ty_v.clone(), phyto_doc.notebook.formal_content());
        toplevel.declarations.insert(
            NameSegment::Text(ustr(phyto_doc_id)),
            TopDecl::Diag(Diag::new(
                theory.clone(),
                model_ty_v.clone(),
                phyto_stx,
                phyto_val,
                phyto_ty,
            )),
        );

        // LOAD THE DIAGRAM
        let src =
            fs::read_to_string(format!("examples/tt/notebook/klausmeier/Klausmeier.json")).unwrap();
        let doc: DiagramDocumentContent = serde_json::from_str(&src).unwrap();
        let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));
        let (_, _, _, ty_v) =
            elab.diagram_notebook(model_ty_v.clone(), doc.notebook.formal_content());

        let pode = Decapodes { pode: ty_v };
        let target = pode.transpile();
        println!("{}", &target.out);
    }
}
