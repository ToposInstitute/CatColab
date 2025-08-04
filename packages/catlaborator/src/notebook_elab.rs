use crate::{database::*, eval::*, syntax::*};
use ::notebook_types::v0::ModelJudgment;
use catlog::dbl::category::VDblCategory;
use catlog::dbl::theory::UstrDiscreteDblTheory;
use catlog::one::Path;
use catlog::zero::name::{QualifiedName, Segment};
use notebook_types::current as notebook_types;
use std::cell::RefCell;
use std::f32::consts::PI;
use std::rc::Rc;
use std::str::FromStr;
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

    fn lookup_by_name(&self, name: Ustr) -> Option<(FwdIdent, TyVal)> {
        self.scope
            .iter()
            .enumerate()
            .find(|(_, (_, name1, _))| &Some(name) == name1)
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
            _ => todo!(),
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
            _ => todo!(),
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

    fn syn_var(&self, ctx: &Context, name: Ustr) -> Option<(TmStx, TmVal, TyVal)> {
        match ctx.lookup_by_name(name) {
            Some((i, ty)) => {
                let tm = TmStx::Var(i);
                let val = ctx.env.values[i.index].clone();
                Some((tm, val, ty))
            }
            None => self.error(NameNotFound(name)),
        }
    }

    fn syn_proj(
        &self,
        ctx: &Context,
        from: (TmStx, TmVal, TyVal),
        field_name: Ustr,
    ) -> Option<(TmStx, TmVal, TyVal)> {
        let (tm, val, ty) = from;
        let class = match ty {
            TyVal::InstanceOf(name) => ctx.env.get_class(&name).unwrap(),
            _ => return self.error(NotAnInstanceType),
        };
        match class.members.iter().enumerate().find(|(_, member)| member.name == field_name) {
            Some((i, member)) => {
                let field = FwdIdent::new(i, Some(field_name));
                let proj_tm = TmStx::Proj(Rc::new(tm), field);
                let proj_val = val.proj(field);
                let proj_ty = val.as_env(&ctx.env.state).eval_ty(&member.ty);
                Some((proj_tm, proj_val, proj_ty))
            }
            None => self.error(NoSuchField(field_name)),
        }
    }

    fn chk_object_string(
        &self,
        ctx: &Context,
        ob_type: ObType,
        source: &str,
    ) -> Option<(TmStx, TmVal)> {
        let segments: Vec<_> = source.split('.').map(ustr).collect();
        if segments.is_empty() {
            return self.error(IncompleteCell);
        }
        let v = self.syn_var(ctx, segments[0])?;
        let (tm, val, ty) = segments[1..]
            .iter()
            .try_fold(v, |from, field_name| self.syn_proj(ctx, from, *field_name))?;
        match ty {
            TyVal::Object(synthed_ob_type) => {
                if ob_type == synthed_ob_type {
                    Some((tm, val))
                } else {
                    self.error(MismatchingObTypes(ob_type, synthed_ob_type))
                }
            }
            _ => self.error(UnexpectedType),
        }
    }

    fn morphism_ty_next(
        &self,
        ctx: &Context,
        mor_decl: &notebook_types::MorDeclNext,
    ) -> Option<(TyStx, TyVal)> {
        let over = match &mor_decl.mor_type {
            notebook_types::MorType::Basic(ustr) => Path::single(*ustr),
            notebook_types::MorType::Hom(ob_type) => Path::empty(ob_type.as_basic()),
            _ => todo!(),
        };
        if !self.theory.has_proarrow(&over) {
            return self.error(NoSuchMorphismType(over));
        }
        let dom_res = self.chk_object_string(ctx, self.theory.src(&over), &mor_decl.dom);
        let cod_res = self.chk_object_string(ctx, self.theory.tgt(&over), &mor_decl.cod);
        let (domstx, domval) = dom_res?;
        let (codstx, codval) = cod_res?;
        Some((
            TyStx::Morphism(over.clone(), domstx, codstx),
            TyVal::Morphism(over.clone(), domval.as_object(), codval.as_object()),
        ))
    }

    fn morphism_ty(
        &self,
        ctx: &Context,
        mor_decl: &notebook_types::MorDecl,
    ) -> Option<(TyStx, TyVal)> {
        let over = match &mor_decl.mor_type {
            notebook_types::MorType::Basic(ustr) => Path::single(*ustr),
            notebook_types::MorType::Hom(ob_type) => Path::empty(ob_type.as_basic()),
            _ => todo!(),
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
                MorphismNext(mor_decl) => {
                    let Some((tystx, tyval)) = self.morphism_ty_next(&ctx, mor_decl) else {
                        continue;
                    };
                    ctx.intro(mor_decl.id, Some(ustr(&mor_decl.name)), tyval);
                    cells.push(MemberStx::new(ustr(&mor_decl.name), tystx))
                }
                Instance(instance_decl) => {
                    let Some(_) = cache.lookup(&instance_decl.notebook_id) else {
                        let _: Option<()> =
                            self.error(NoSuchNotebook(instance_decl.notebook_id.to_string()));
                        continue;
                    };
                    let nbref = ClassIdent {
                        id: ustr(&instance_decl.notebook_id),
                    };
                    let tyval = TyVal::InstanceOf(nbref);
                    let tystx = TyStx::InstanceOf(nbref);
                    ctx.intro(instance_decl.id, Some(ustr(&instance_decl.name)), tyval);
                    cells.push(MemberStx::new(ustr(&instance_decl.name), tystx))
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
