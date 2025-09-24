//! Elaboration for frontend notebooks.
use notebook_types::v1::{ModelJudgment, MorDecl, Notebook, Ob, ObDecl, ObType};
use uuid::Uuid;

use crate::dbl::{VDblCategory, theory::DblTheory};
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

/// An elaboration error
#[derive(Debug)]
pub enum Error {
    /// The theory does not contain this object type
    NoSuchObjectType(QualifiedName),
    /// There is no such variable in scope
    NoSuchVariable(VarName),
    /// Tried to elaborate a notebook that uses tabulator features
    TabulatorUnsupported,
    /// Tried to elaborate a notebook that uses modal features
    ModalUnsupported,
    /// Tried to elaborate a notebook that uses a non-discrete double theory
    NonDiscreteUnsupported,
    /// Expected a variable to refer to an object
    ExpectedObject,
    /// The variable in the domain slot of an arrow doesn't have the right object type
    MismatchedDomTypes {
        /// The expected object type
        expected: ObjectType,
        /// The object type of the variable given
        synthesized: ObjectType,
    },
    /// The variable in the codomain slot of an arrow doesn't have the right object type
    MismatchedCodTypes {
        /// The expected object type
        expected: ObjectType,
        /// The object type of the variable given
        synthesized: ObjectType,
    },
}

/// An error along with its location (a cell in a notebook)
pub struct LocatedError {
    cell: Option<Uuid>,
    content: Error,
}

/// The current state of a notebook elaboration session.
///
/// We feed a notebook into this cell-by-cell.
pub struct Elaborator<'a> {
    toplevel: &'a Toplevel,
    current_cell: Option<Uuid>,
    ctx: Context,
    errors: Vec<LocatedError>,
}

struct ElaboratorCheckpoint {
    ctx: ContextCheckpoint,
}

impl<'a> Elaborator<'a> {
    /// Create a new notebook elaborator
    pub fn new(toplevel: &'a Toplevel) -> Self {
        Self {
            toplevel,
            current_cell: None,
            ctx: Context::new(),
            errors: Vec::new(),
        }
    }

    /// Get all of the errors from elaboration
    pub fn errors(&self) -> &[LocatedError] {
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
        self.ctx.scope.push((name, label, ty));
        v
    }

    fn error<T>(&mut self, error: Error) -> Option<T> {
        self.errors.push(LocatedError {
            cell: self.current_cell,
            content: error,
        });
        None
    }

    fn ob_type(&mut self, ob_type: &ObType) -> Option<QualifiedName> {
        match &ob_type {
            ObType::Basic(name) => Some(QualifiedName::single(text_seg(*name))),
            ObType::Tabulator(_) => self.error(Error::TabulatorUnsupported),
            ObType::ModeApp { .. } => self.error(Error::ModalUnsupported),
        }
    }

    fn object_cell(&mut self, ob_decl: &ObDecl) -> Option<(NameSegment, LabelSegment, TyS, TyV)> {
        let ob_type = self.ob_type(&ob_decl.ob_type)?;
        if !self.toplevel.theory.has_ob(&ob_type) {
            return self.error(Error::NoSuchObjectType(ob_type.clone()));
        }
        let name = NameSegment::Uuid(ob_decl.id);
        let label = LabelSegment::Text(ustr(&ob_decl.name));
        Some((name, label, TyS::object(ob_type.clone()), TyV::object(ob_type)))
    }

    fn lookup_tm(&mut self, name: VarName) -> Option<(TmS, TmV, TyV)> {
        let Some((i, (_, label, ty))) = self
            .ctx
            .scope
            .iter()
            .rev()
            .enumerate()
            .find(|(_, (name1, _, _))| name1 == &name)
        else {
            return self.error(Error::NoSuchVariable(name));
        };
        let v = self.ctx.env.get(i).unwrap().clone();
        Some((TmS::var(i.into(), name, *label), v, ty.clone().unwrap()))
    }

    fn ob(&mut self, n: &Ob) -> Option<(TmS, TmV, ObjectType)> {
        match n {
            Ob::Basic(name) => {
                let (tm, val, ty) =
                    self.lookup_tm(NameSegment::Uuid(Uuid::from_str(&name).unwrap()))?;
                let ob_type = match &*ty {
                    TyV_::Object(ob_type) => ob_type.clone(),
                    _ => return self.error(Error::ExpectedObject),
                };
                Some((tm, val, ob_type))
            }
            Ob::App { .. } => self.error(Error::NonDiscreteUnsupported),
            Ob::List { .. } => self.error(Error::ModalUnsupported),
            Ob::Tabulated(_) => self.error(Error::TabulatorUnsupported),
        }
    }

    fn morphism_cell(
        &mut self,
        mor_decl: &MorDecl,
    ) -> Option<(NameSegment, LabelSegment, TyS, TyV)> {
        let (mor_type, dom_ty, cod_ty) = match &mor_decl.mor_type {
            notebook_types::v1::MorType::Basic(name) => {
                let name = QualifiedName::single(text_seg(*name));
                let mor_type = Path::single(name);
                let dom_ty = self.toplevel.theory.src_type(&mor_type);
                let cod_ty = self.toplevel.theory.tgt_type(&mor_type);
                (MorphismType(mor_type), dom_ty, cod_ty)
            }
            notebook_types::v1::MorType::Hom(ob_type) => {
                let ob_type = self.ob_type(ob_type)?;
                (MorphismType(Path::Id(ob_type.clone())), ob_type.clone(), ob_type)
            }
            notebook_types::v1::MorType::Composite(mor_types) => {
                todo!()
            }
            notebook_types::v1::MorType::ModeApp { .. } => {
                return self.error(Error::ModalUnsupported);
            }
        };
        let name = NameSegment::Uuid(mor_decl.id);
        let label = LabelSegment::Text(ustr(&mor_decl.name));
        let dom = mor_decl.dom.as_ref().and_then(|ob| self.ob(ob));
        let cod = mor_decl.cod.as_ref().and_then(|ob| self.ob(ob));
        let ((dom_s, dom_v, synthed_dom_ty), (cod_s, cod_v, synthed_cod_ty)) = (dom?, cod?);
        let correct_dom = if synthed_dom_ty != dom_ty {
            self.error(Error::MismatchedDomTypes {
                expected: dom_ty,
                synthesized: synthed_dom_ty,
            })
        } else {
            Some(())
        };
        let correct_cod = if synthed_cod_ty != cod_ty {
            self.error(Error::MismatchedCodTypes {
                expected: cod_ty,
                synthesized: synthed_cod_ty,
            })
        } else {
            Some(())
        };
        let _ = (correct_dom?, correct_cod?);
        Some((
            name,
            label,
            TyS::morphism(mor_type.clone(), dom_s, cod_s),
            TyV::morphism(mor_type, dom_v, cod_v),
        ))
    }

    fn notebook(&mut self, cells: &[(Uuid, &ModelJudgment)]) -> Option<(TyS, TyV)> {
        let mut field_ty0s = Vec::new();
        let mut field_ty_vs = Vec::new();
        let self_var = self.intro(text_seg("self"), label_seg("self"), None).as_neu();
        let c = self.checkpoint();
        for (id, cell) in cells.iter() {
            self.current_cell = Some(*id);
            let (name, label, ty_s, ty_v) = match cell {
                ModelJudgment::Object(ob_decl) => self.object_cell(ob_decl),
                ModelJudgment::Morphism(mor_decl) => self.morphism_cell(mor_decl),
            }?;
            field_ty0s.push((name, (label, ty_v.ty0())));
            field_ty_vs.push((name, (label, ty_v.clone())));
            self.ctx.scope.push((name, label, Some(ty_v.clone())));
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
    use notebook_types::v1::{Document, ModelDocumentContent, ModelJudgment, Notebook};
    use serde_json;
    use std::fmt::Write;
    use std::{fs, rc::Rc};

    use expect_test::{Expect, expect};

    use crate::{
        stdlib::th_schema,
        tt::{
            modelgen::{generate, model_output},
            notebook_elab::Elaborator,
            toplevel::Toplevel,
        },
    };

    fn elab_example(name: &str, expected: Expect) {
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
        let toplevel = Toplevel::new(Rc::new(th_schema()));
        let mut elab = Elaborator::new(&toplevel);
        let mut out = String::new();
        if let Some((_, ty_v)) = elab.notebook(&cells) {
            let (model, name_translation) = generate(&toplevel, &ty_v);
            model_output("", &mut out, &model, &name_translation).unwrap();
        } else {
            assert!(
                !elab.errors().is_empty(),
                "did not produce a model, but no errors were reported"
            );
            for error in elab.errors() {
                writeln!(&mut out, "error at cell {:?} : {:?}", error.cell.unwrap(), error.content)
                    .unwrap()
            }
        }
        expected.assert_eq(&out);
    }

    #[test]
    fn examples() {
        elab_example(
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
