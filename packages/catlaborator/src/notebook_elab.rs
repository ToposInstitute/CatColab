use crate::{database::*, eval::*, syntax::*};
use ::notebook_types::v0::ModelJudgment;
use catlog::dbl::category::VDblCategory;
use catlog::dbl::theory::UstrDiscreteDblTheory;
use catlog::one::Path;
use catlog::zero::name::{QualifiedName, Segment};
use notebook_types::current as notebook_types;
use std::cell::RefCell;
use std::rc::Rc;
use ustr::{Ustr, ustr};
use uuid::Uuid;

#[derive(Clone)]
pub struct Elaborator {
    errors: Rc<RefCell<Vec<ElaborationError>>>,
    theory: Rc<UstrDiscreteDblTheory>,
    current_cell_id: Option<Uuid>,
}

pub struct Context {
    scope: Vec<(Uuid, Option<Ustr>, TyVal)>,
    env: Env,
}

use ElaborationErrorContent::*;

impl Context {
    fn new(cache: ElaborationDatabase, theory: Rc<UstrDiscreteDblTheory>) -> Self {
        Self {
            scope: Vec::new(),
            env: State::empty(Rc::new(cache), theory).new_env(),
        }
    }

    fn lookup(&self, uuid: &Uuid) -> Option<(FwdIdent, TyVal)> {
        self.scope
            .iter()
            .enumerate()
            .find(|(_, (uuid1, _, _))| uuid == uuid1)
            .map(|(i, (_, name, ty))| (FwdIdent::new(i, *name), ty.clone()))
    }

    fn intro(&mut self, uuid: Uuid, name: Option<Ustr>, ty: TyVal) {
        let i = self.scope.len();
        let at = QualifiedName::singleton(Segment::new(i).with_id(uuid).set_name(name));
        let val = self.env.intro(at, &ty);
        self.env.values.push(val);
        self.scope.push((uuid, name, ty));
    }
}

impl Elaborator {
    pub fn report(self) -> Vec<ElaborationError> {
        self.errors.take()
    }

    pub fn new(theory: Rc<UstrDiscreteDblTheory>) -> Self {
        Self {
            errors: Rc::new(RefCell::new(Vec::new())),
            theory,
            current_cell_id: None,
        }
    }

    fn error<T>(&self, error: ElaborationErrorContent) -> Option<T> {
        self.errors.borrow_mut().push(ElaborationError {
            cell: self.current_cell_id,
            content: error,
        });
        None
    }

    fn object_ty(&self, ob_decl: &notebook_types::ObDecl) -> Option<(TyStx, TyVal)> {
        match &ob_decl.ob_type {
            notebook_types::ObType::Basic(ob_type) => {
                if !self.theory.has_ob(ob_type) {
                    return self.error(NoSuchObjectType(*ob_type));
                }
                Some((TyStx::Object(*ob_type), TyVal::Object(*ob_type)))
            }
            notebook_types::ObType::Tabulator(_mor_type) => self.error(TabulatorUnsupported),
        }
    }

    fn syn_object(&self, ctx: &Context, ob: &notebook_types::Ob) -> Option<(TmStx, TmVal, ObType)> {
        match ob {
            notebook_types::Ob::Basic(uuid) => {
                let (l, ty) = ctx.lookup(uuid).or_else(|| self.error(UuidNotFound(*uuid)))?;
                let val = ctx.env.get(l);
                let ob_type = match ty {
                    TyVal::Object(ustr) => ustr,
                    _ => return self.error(ExpectedObjectForUuid(*uuid)),
                };
                Some((TmStx::Var(l), val, ob_type))
            }
            notebook_types::Ob::Tabulated(_mor) => self.error(TabulatorUnsupported),
        }
    }

    fn chk_object(
        &self,
        ctx: &Context,
        ob_type: ObType,
        ob: &notebook_types::Ob,
    ) -> Option<(TmStx, TmVal)> {
        let (obstx, obval, synthed) = self.syn_object(ctx, ob)?;
        if synthed != ob_type {
            self.error(MismatchingObTypes(ob_type, synthed))
        } else {
            Some((obstx, obval))
        }
    }

    fn morphism_ty(
        &self,
        ctx: &Context,
        mor_decl: &notebook_types::MorDecl,
    ) -> Option<(TyStx, TyVal)> {
        let over = match &mor_decl.mor_type {
            notebook_types::MorType::Basic(ustr) => Path::single(*ustr),
            notebook_types::MorType::Hom(ob_type) => Path::empty(ob_type.as_basic()),
        };
        if !self.theory.has_proarrow(&over) {
            return self.error(NoSuchMorphismType(over));
        }
        let dom_res = self.chk_object(
            ctx,
            self.theory.src(&over),
            mor_decl.dom.as_ref().or_else(|| self.error(IncompleteCell))?,
        );
        let cod_res = self.chk_object(
            ctx,
            self.theory.tgt(&over),
            mor_decl.cod.as_ref().or_else(|| self.error(IncompleteCell))?,
        );
        let (domstx, domval) = dom_res?;
        let (codstx, codval) = cod_res?;
        Some((
            TyStx::Morphism(over.clone(), domstx, codstx),
            TyVal::Morphism(over.clone(), domval.as_object(), codval.as_object()),
        ))
    }

    pub fn class(
        &self,
        cache: ElaborationDatabase,
        raw: &notebook_types::Notebook<ModelJudgment>,
    ) -> Option<ClassStx> {
        let mut cells = Vec::new();
        let mut ctx = Context::new(cache.clone(), self.theory.clone());
        for raw_cell in raw.cells.iter() {
            use notebook_types::NotebookCell::*;
            let content = match raw_cell {
                Formal { id: _, content } => content,
                _ => continue,
            };
            use notebook_types::ModelJudgment::*;
            match content {
                Object(ob_decl) => {
                    let Some((tystx, tyval)) = self.object_ty(ob_decl) else {
                        continue;
                    };
                    ctx.intro(ob_decl.id, Some(ustr(&ob_decl.name)), tyval);
                    cells.push(MemberStx::new(ustr(&ob_decl.name), tystx))
                }
                Morphism(mor_decl) => {
                    let Some((tystx, tyval)) = self.morphism_ty(&ctx, mor_decl) else {
                        continue;
                    };
                    ctx.intro(mor_decl.id, Some(ustr(&mor_decl.name)), tyval);
                    cells.push(MemberStx::new(ustr(&mor_decl.name), tystx))
                }
                Record(record_decl) => {
                    let Some(_) = cache.lookup(&record_decl.notebook_id) else {
                        let _: Option<()> =
                            self.error(NoSuchNotebook(record_decl.notebook_id.to_string()));
                        continue;
                    };
                    let nbref = ClassIdent {
                        id: ustr(&record_decl.notebook_id),
                    };
                    let tyval = TyVal::InstanceOf(nbref);
                    let tystx = TyStx::InstanceOf(nbref);
                    ctx.intro(record_decl.id, Some(ustr(&record_decl.name)), tyval);
                    cells.push(MemberStx::new(ustr(&record_decl.name), tystx))
                }
            }
        }

        if self.errors.borrow().len() == 0 {
            Some(ClassStx::new(cells))
        } else {
            None
        }
    }
}
