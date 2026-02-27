//! Elaboration for frontend notebooks.
//!
//! The notebook elaborator is disjoint from the [text
//! elaborator](super::text_elab). One reason for this is that error reporting
//! must be completely different to be well adapted to the notebook interface.
//! As a first pass, we are associating cell UUIDs with errors.

use nonempty::NonEmpty;
use notebook_types::current as nb;
use std::str::FromStr;
use uuid::Uuid;

use super::{context::*, eval::*, prelude::*, stx::*, theory::*, toplevel::*, val::*};
use crate::dbl::{
    modal,
    model::{Feature, InvalidDblModel},
};
use crate::one::InvalidPathEq;
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

    fn ob_syn(&self, n: &nb::Ob) -> Option<(TmS, TmV, ObType)> {
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
                let arg_type = self.theory().ob_op_dom(&ob_op);
                let (arg_stx, arg_val) = self.ob_chk(ob, &arg_type)?;
                let stx = TmS::ob_app(name, arg_stx);
                let val = TmV::app(name, arg_val);
                Some((stx, val, self.theory().ob_op_cod(&ob_op)))
            }
            _ => None,
        }
    }

    fn mor_syn(&self, n: &nb::Mor) -> Option<(TmS, TmV, TyV)> {
        match n {
            nb::Mor::Basic(name) => {
                let name = QualifiedName::deserialize_str(name).unwrap();
                let (stx, val, ty) = self.resolve_name(name.as_slice())?;
                let TyV_::Morphism(..) = &*ty else {
                    return None;
                };
                Some((stx, val, ty))
            }
            nb::Mor::Composite(path) => match path.as_ref() {
                nb::Path::Id(ob) => {
                    let (stx, val, ob_type) = self.ob_syn(ob)?;
                    let mor_type = self.theory().hom_type(ob_type);
                    Some((stx, val.clone(), TyV::morphism(mor_type, val.clone(), val.clone())))
                }
                nb::Path::Seq(ms) => match ms.as_slice() {
                    [] => None,
                    [only] => self.mor_syn(only),
                    [first, rest @ ..] => {
                        let (stx_first, val_first, type_first) = self.mor_syn(first)?;
                        let rest = nb::Mor::Composite(Box::new(nb::Path::Seq(rest.to_vec())));
                        let (stx_rest, val_rest, type_rest) = self.mor_syn(&rest)?;
                        let TyV_::Morphism(mt_first, dom_first, cod_first) = &*type_first else {
                            unreachable!()
                        };
                        let TyV_::Morphism(mt_rest, dom_rest, cod_rest) = &*type_rest else {
                            unreachable!()
                        };
                        if mt_first != mt_rest {
                            return None;
                        }
                        if self.evaluator().equal_tm(cod_first, dom_rest).is_err() {
                            return None;
                        }
                        let stx = TmS::compose(stx_first, stx_rest);
                        let val = TmV::compose(val_first, val_rest);
                        Some((
                            stx,
                            val,
                            TyV::morphism(mt_first.clone(), dom_first.clone(), cod_rest.clone()),
                        ))
                    }
                },
            },
            _ => None, // tabulator morphisms tbd
        }
    }

    fn ob_chk(&self, n: &nb::Ob, ob_type: &ObType) -> Option<(TmS, TmV)> {
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
                Some((TmS::list(elem_stxs), TmV::list(elem_vals)))
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
        let Some((dom_s, dom_v)) = mor_decl.dom.as_ref().and_then(|ob| self.ob_chk(ob, &dom_ty))
        else {
            return self.ty_error(InvalidDblModel::DomType(id));
        };
        let Some((cod_s, cod_v)) = mor_decl.cod.as_ref().and_then(|ob| self.ob_chk(ob, &cod_ty))
        else {
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

    fn equation_cell_ty(&mut self, eqn_decl: &nb::EqnDecl) -> (TyS, TyV) {
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
                errors.push(InvalidPathEq::Lhs);
                None
            }
        };
        let rhs = match self.mor_syn(rhs_m) {
            Some(synthed) => Some(synthed),
            None => {
                errors.push(InvalidPathEq::Rhs);
                None
            }
        };

        if let (Some((_, _, lhs_ty)), Some((_, _, rhs_ty))) = (&lhs, &rhs) {
            let TyV_::Morphism(mt_lhs, dom_lhs, cod_lhs) = &**lhs_ty else {
                unreachable!()
            };
            let TyV_::Morphism(mt_rhs, dom_rhs, cod_rhs) = &**rhs_ty else {
                unreachable!()
            };
            if mt_lhs != mt_rhs {
                errors.push(InvalidPathEq::Graph);
            } else {
                if self.evaluator().equal_tm(dom_lhs, dom_rhs).is_err() {
                    errors.push(InvalidPathEq::Src);
                }
                if self.evaluator().equal_tm(cod_lhs, cod_rhs).is_err() {
                    errors.push(InvalidPathEq::Tgt);
                }
            }
        }
        match (NonEmpty::from_vec(errors), lhs, rhs) {
            (None, Some((lhs_s, lhs_v, lhs_ty)), Some((rhs_s, rhs_v, _))) => {
                let ty_s = TyS::id(self.evaluator().quote_ty(&lhs_ty), lhs_s, rhs_s);
                let ty_v = TyV::id(lhs_ty, lhs_v, rhs_v);
                (ty_s, ty_v)
            }
            (Some(errors), _, _) => {
                self.ty_error(InvalidDblModel::Eqn(None, errors)) //The assumption in InvalidDblModel that we should already have the vector of equations built up, so as to give the index in the first argument here, doesn't hold in this case. It would be best in principle not to use InvalidDblModel here before we've begun to build a DblModel...
            }
            _ => unreachable!(),
        }
    }

    fn equation_cell(&mut self, eqn_decl: &nb::EqnDecl) -> (NameSegment, LabelSegment, TyS, TyV) {
        let name = NameSegment::Uuid(eqn_decl.id); //Kind of funny that the decl's id produces the cell's name but the decl's name produces the cell's label.
        let label = LabelSegment::Text(ustr(&eqn_decl.name));
        let (ty_s, ty_v) = self.equation_cell_ty(eqn_decl);
        (name, label, ty_s, ty_v)
    }

    fn instantiation_cell_ty(&mut self, i_decl: &nb::InstantiatedModel) -> (TyS, TyV) {
        let name = QualifiedName::single(NameSegment::Uuid(i_decl.id));
        let link = match &i_decl.model {
            Some(l) => l,
            None => return self.ty_error(InvalidDblModel::InvalidLink(name)),
        };
        let notebook_types::current::LinkType::Instantiation = link.r#type else {
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
                let Some((ob_s, ob_v, ob_type)) = self.ob_syn(ob) else {
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
                self.ctx.env.snoc(TmV::neu(TmN::proj(self_var.clone(), name, label), ty_v));
        }

        self.reset_to(c);
        let field_tys: Row<_> = field_ty_vs
            .iter()
            .map(|(name, (label, ty_v))| (*name, (*label, self.evaluator().quote_ty(ty_v))))
            .collect();
        let r_v = RecordV::new(self.ctx.env.clone(), field_tys.clone(), Dtry::empty());
        (TyS::record(field_tys), TyV::record(r_v))
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
    use crate::stdlib::{th_schema, th_sym_monoidal_category};
    use crate::tt::{
        modelgen::Model,
        notebook_elab::Elaborator,
        theory::{Theory, TheoryDef},
        toplevel::Toplevel,
    };
    use crate::zero::name;
    use notebook_types::current::ModelDocumentContent;

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
        let th_smc = Theory::new(name("ThSMC"), TheoryDef::modal(th_sym_monoidal_category()));
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

    /// Test a notebook with an equation. Note that as of Feb 2026 the equation is not
    /// actually being printed out.
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
                b : SW -> SE : Hom Entity"#]],
        );
        let model = model.as_discrete().unwrap();
        let eqns: Vec<_> = model.category.equations().collect();
        assert_eq!(eqns.len(), 1);
    }
}
