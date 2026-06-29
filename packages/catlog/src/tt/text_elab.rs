//! Elaboration from plain text for DoubleTT.

use fnotation::*;
use scopeguard::{ScopeGuard, guard};

use fnotation::{ParseConfig, parser::Prec};
use tattle::declare_error;

use super::{
    context::*, eval::*, modelgen::*, prelude::*, stx::*, theory::*, toplevel::*, val::*, wd::*,
};
use crate::{
    dbl::model::DblModelPrinter,
    zero::{QualifiedName, name},
};

/// Parser config for DoubleTT.
pub const TT_PARSE_CONFIG: ParseConfig = ParseConfig::new(
    &[
        (":", Prec::nonassoc(20)),
        (":=", Prec::nonassoc(10)),
        ("&", Prec::lassoc(40)),
        ("*", Prec::lassoc(60)),
        ("==", Prec::nonassoc(30)),
    ],
    &[":", ":=", "&", "Unit", "Hom", "*", "=="],
    &[
        "model",
        "def",
        "instance",
        "syn",
        "chk",
        "norm",
        "generate",
        "uwd",
        "set_theory",
    ],
);

/// The result of elaborating a top-level statement.
pub enum TopElabResult {
    /// A new declaration.
    Declaration(TopVarName, TopDecl),
    /// Output that should be logged.
    Output(String),
}

/// Context for top-level elaboration.
///
/// Top-level elaboration is elaboration of declarations.
pub struct TopElaborator {
    current_theory: Option<Theory>,
    reporter: Reporter,
}

impl TopElaborator {
    /// Constructs a context for top-level elaboration.
    pub fn new(reporter: Reporter) -> Self {
        Self { current_theory: None, reporter }
    }

    fn bare_def<'c>(&self, n: &FNtn<'c>) -> Option<(TopVarName, &'c FNtn<'c>)> {
        match n.ast0() {
            App2(L(_, Keyword(":=")), L(_, Var(name)), tn) => {
                Some((NameSegment::Text(ustr(name)), tn))
            }
            _ => None,
        }
    }

    fn annotated_def<'c>(
        &self,
        n: &FNtn<'c>,
    ) -> Option<(TopVarName, Option<&'c [&'c FNtn<'c>]>, &'c FNtn<'c>, &'c FNtn<'c>)> {
        match n.ast0() {
            App2(L(_, Keyword(":=")), L(_, App2(L(_, Keyword(":")), head_n, annotn)), valn) => {
                match head_n.ast0() {
                    App1(L(_, Var(name)), L(_, Tuple(args))) => {
                        Some((name_seg(*name), Some(args.as_slice()), annotn, valn))
                    }
                    Var(name) => Some((name_seg(*name), None, annotn, valn)),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    fn expr_with_context<'c>(&self, n: &'c FNtn<'c>) -> (&'c [&'c FNtn<'c>], &'c FNtn<'c>) {
        match n.ast0() {
            App1(L(_, Tuple(ctx_elems)), n) => (ctx_elems.as_slice(), n),
            _ => (&[], n),
        }
    }

    fn get_theory(&self, loc: Loc) -> Option<Theory> {
        let Some(theory) = &self.current_theory else {
            return self.error(
                loc,
                "have not yet set a theory, set a theory via `set_theory <THEORY_NAME>`",
            );
        };
        Some(theory.clone())
    }

    fn elaborator<'a>(&self, theory: &Theory, toplevel: &'a Toplevel) -> Elaborator<'a> {
        Elaborator::new(theory.clone(), self.reporter.clone(), toplevel)
    }

    fn error<T>(&self, loc: Loc, msg: impl Into<String>) -> Option<T> {
        self.reporter.error(loc, ELAB_ERROR, msg.into());
        None
    }

    /// Elaborate a single top-level declaration.
    pub fn elab(&mut self, toplevel: &Toplevel, tn: &FNtnTop) -> Option<TopElabResult> {
        match tn.name {
            "set_theory" => match tn.body.ast0() {
                Var(theory_name) => match toplevel.theory_library.get(&name(*theory_name)) {
                    Some(theory) => {
                        self.current_theory = Some(theory.clone());
                        Some(TopElabResult::Output(format!("set theory to {}", theory_name)))
                    }
                    None => self.error(tn.loc, format!("{theory_name} not found")),
                },
                _ => self.error(tn.loc, "expected a theory name"),
            },
            "model" => {
                let theory = self.get_theory(tn.loc)?;
                let (name, ty_n) = self.bare_def(tn.body).or_else(|| {
                    self.error(
                        tn.loc,
                        "unknown syntax for model declaration, expected <name> := <model>",
                    )
                })?;
                let (ty_s, ty_v) = self.elaborator(&theory, toplevel).ty(ty_n);
                Some(TopElabResult::Declaration(
                    name,
                    TopDecl::Type(Type::new(theory.clone(), ty_s, ty_v)),
                ))
            }
            "def" => {
                let theory = self.get_theory(tn.loc)?;
                let (name, args_n, ty_n, tm_n) = self.annotated_def(tn.body).or_else(|| {
                    self.error(
                        tn.loc,
                        "unknown syntax for term declaration, expected <name> : <type> := <term>",
                    )
                })?;
                match args_n {
                    Some(args_n) => {
                        let mut elab = self.elaborator(&theory, toplevel);
                        let mut args_stx = IndexMap::new();
                        for arg_n in args_n {
                            let (name, label, ty_s, ty_v) = elab.binding(arg_n)?;
                            args_stx.insert(name, (label, ty_s));
                            elab.intro(name, label, Some(ty_v));
                        }
                        let (ret_ty_s, ret_ty_v) = elab.ty(ty_n);
                        let (body_s, _) = elab.chk(&ret_ty_v, tm_n);
                        Some(TopElabResult::Declaration(
                            name,
                            TopDecl::Def(Def::new(
                                theory.clone(),
                                args_stx.into(),
                                ret_ty_s,
                                body_s,
                            )),
                        ))
                    }
                    None => {
                        let mut elab = self.elaborator(&theory, toplevel);
                        let (ret_ty_s, ret_ty_v) = elab.ty(ty_n);
                        let (body_s, _) = elab.chk(&ret_ty_v, tm_n);
                        // A closed (empty-context) term: a tight transformation
                        // S -> Unit. Unit is the empty record, i.e. the empty model.
                        // A tight map into the empty model exists only when S is itself empty,
                        // so the sole closed `def` is the identity on the empty
                        // model, `tt : Unit`. Such a closed term is just a nullary
                        // `Def` (empty argument context).
                        Some(TopElabResult::Declaration(
                            name,
                            TopDecl::Def(Def::new(theory.clone(), Row::empty(), ret_ty_s, body_s)),
                        ))
                    }
                }
            }
            "instance" => {
                let theory = self.get_theory(tn.loc)?;
                let (name, args_n, ty_n, tm_n) = self.annotated_def(tn.body).or_else(|| {
                    self.error(
                        tn.loc,
                        "unknown syntax for instance declaration, expected <name> : <type> := [...]",
                    )
                })?;
                if args_n.is_some() {
                    return self.error(
                        tn.loc,
                        "an instance takes no arguments; for a parameterized map between \
                         models, use `def`",
                    );
                }
                let mut elab = self.elaborator(&theory, toplevel);
                let (_, ret_ty_v) = elab.ty(ty_n);
                // An instance body is checked against its codomain model, a
                // record type.
                let BaseTyV_::Record(r) = &*ret_ty_v else {
                    return self
                        .error(tn.loc, "an instance must be declared against a record type");
                };
                let (tm_s, tm_v) = elab.instance_body(r, tm_n);
                Some(TopElabResult::Declaration(
                    name,
                    TopDecl::Instance(Instance::new(theory.clone(), tm_s, tm_v, ret_ty_v)),
                ))
            }
            "syn" => {
                let theory = self.get_theory(tn.loc)?;
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                let mut elab = self.elaborator(&theory, toplevel);
                for ctx_n in ctx_ns {
                    let (name, label, _, ty_v) = elab.binding(ctx_n)?;
                    elab.intro(name, label, Some(ty_v));
                }
                let (tm_s, _, ty_v) = elab.syn(n);
                Some(TopElabResult::Output(format!(
                    "{tm_s} : {}",
                    elab.evaluator().quote_ty(&ty_v)
                )))
            }
            "norm" => {
                let theory = self.get_theory(tn.loc)?;
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                let mut elab = self.elaborator(&theory, toplevel);
                for ctx_n in ctx_ns {
                    let (name, label, _, ty_v) = elab.binding(ctx_n)?;
                    elab.intro(name, label, Some(ty_v));
                }
                let (_, tm_v, ty_v) = elab.syn(n);
                let eval = elab.evaluator();
                let tm_s = eval.quote_tm(&eval.eta(&tm_v, Some(&ty_v)));
                Some(TopElabResult::Output(format!("{tm_s}")))
            }
            "chk" => {
                let theory = self.get_theory(tn.loc)?;
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                let mut elab = self.elaborator(&theory, toplevel);
                for ctx_n in ctx_ns {
                    let (name, label, _, ty_v) = elab.binding(ctx_n)?;
                    elab.intro(name, label, Some(ty_v));
                }
                let (tm_n, ty_n) = match n.ast0() {
                    App2(L(_, Keyword(":")), tm_n, ty_n) => (tm_n, ty_n),
                    _ => return elab.error("expected <expr> : <type>"),
                };
                let (_, ty_v) = elab.ty(ty_n);
                let (tm_s, _) = elab.chk(&ty_v, tm_n);
                Some(TopElabResult::Output(format!("{tm_s}")))
            }
            "uwd" => {
                let theory = self.get_theory(tn.loc)?;
                let mut elab = self.elaborator(&theory, toplevel);
                let (_, ty_v) = elab.ty(tn.body);
                let Some(uwd) = record_to_uwd(&ty_v) else {
                    return self.error(tn.loc, "expected a record type");
                };
                let out = uwd.to_doc().0.pretty(77).to_string().replace("\n", "\n#/ ");
                Some(TopElabResult::Output(out))
            }
            "generate" => {
                let theory = self.get_theory(tn.loc)?;
                let mut elab = self.elaborator(&theory, toplevel);
                let (_, ty_v) = elab.ty(tn.body);
                let (model, ns) = Model::from_ty(toplevel, &theory.definition, &ty_v);
                let printer = DblModelPrinter::new().include_summary(true);
                let out = model.to_doc(&printer, &ns).0.pretty(77).to_string();
                let out = out.trim().replace("\n", "\n#/ ");
                Some(TopElabResult::Output(out))
            }
            _ => self.error(tn.loc, "unknown toplevel declaration"),
        }
    }
}

/// Text-based elaborator of types.
pub struct Elaborator<'a> {
    theory: Theory,
    reporter: Reporter,
    toplevel: &'a Toplevel,
    loc: Option<Loc>,
    ctx: Context,
    next_meta: usize,
}

struct ElaboratorCheckpoint {
    loc: Option<Loc>,
    ctx: ContextCheckpoint,
}

declare_error!(ELAB_ERROR, "elab", "an error during elaboration");

impl<'a> Elaborator<'a> {
    /// Constructs a new elaborator.
    pub fn new(theory: Theory, reporter: Reporter, toplevel: &'a Toplevel) -> Self {
        Self {
            theory,
            reporter,
            toplevel,
            loc: None,
            ctx: Context::new(),
            next_meta: 0,
        }
    }

    /// Reserved name under which an instance's codomain model is bound
    /// as a context variable (see [`Self::instance_body`]). It contains
    /// a space, so the lexer — which restricts identifiers to
    /// alphanumerics and `_` — can never produce it; hence a
    /// user-declared generator, sub-instance, or field can never shadow
    /// the codomain binding.
    const CODOMAIN_BINDER: &'static str = "instance self";

    /// The codomain model of the instance body currently being
    /// elaborated, if any. Its fields are the codomain's generators,
    /// looked up by name by the instance-clause arms.
    ///
    /// The model is held as a record variable in the context under the
    /// reserved [`Self::CODOMAIN_BINDER`] name (see
    /// [`Self::instance_body`]).
    fn instance_codomain(&self) -> Option<Rc<RecordV>> {
        let (_, _, ty) = self.ctx.lookup(name_seg(Self::CODOMAIN_BINDER))?;
        match &*ty? {
            BaseTyV_::Record(r) => Some(Rc::new(r.clone())),
            _ => None,
        }
    }

    fn theory(&self) -> &TheoryDef {
        &self.theory.definition
    }

    fn checkpoint(&self) -> ElaboratorCheckpoint {
        ElaboratorCheckpoint {
            loc: self.loc,
            ctx: self.ctx.checkpoint(),
        }
    }

    fn reset_to(&mut self, c: ElaboratorCheckpoint) {
        self.loc = c.loc;
        self.ctx.reset_to(c.ctx);
    }

    fn enter<'c>(&'c mut self, loc: Loc) -> ScopeGuard<&'c mut Self, impl FnOnce(&'c mut Self)> {
        let c = self.checkpoint();
        self.loc = Some(loc);
        guard(self, |e| {
            e.reset_to(c);
        })
    }

    fn fresh_meta(&mut self) -> MetaVar {
        let i = self.next_meta;
        self.next_meta += 1;
        MetaVar::new(None, i)
    }

    fn error<T>(&self, msg: impl Into<String>) -> Option<T> {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        None
    }

    fn ty_hole(&mut self) -> (BaseTyS, BaseTyV) {
        let ty_m = self.fresh_meta();
        (BaseTyS::meta(ty_m), BaseTyV::meta(ty_m))
    }

    fn ty_error(&mut self, msg: impl Into<String>) -> (BaseTyS, BaseTyV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.ty_hole()
    }

    fn syn_hole(&mut self) -> (TmS, TmV, BaseTyV) {
        let tm_m = self.fresh_meta();
        let ty_m = self.fresh_meta();
        (TmS::meta(tm_m), TmV::meta(tm_m), BaseTyV::meta(ty_m))
    }

    fn syn_error(&mut self, msg: impl Into<String>) -> (TmS, TmV, BaseTyV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.syn_hole()
    }

    fn chk_hole(&mut self) -> (TmS, TmV) {
        let tm_m = self.fresh_meta();
        (TmS::meta(tm_m), TmV::meta(tm_m))
    }

    fn chk_error(&mut self, msg: impl Into<String>) -> (TmS, TmV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.chk_hole()
    }

    fn evaluator(&self) -> Evaluator<'a> {
        Evaluator::new(self.toplevel, self.ctx.env.clone(), self.ctx.scope.len())
    }

    fn intro(&mut self, name: VarName, label: LabelSegment, ty: Option<BaseTyV>) -> TmV {
        let v = TmV::neu(
            TmN::var(self.ctx.scope.len().into(), name, label),
            ty.clone().unwrap_or(BaseTyV::empty_record()),
        );
        let v = if ty.is_some() {
            self.evaluator().eta(&v, ty.as_ref())
        } else {
            v
        };
        self.ctx.env = self.ctx.env.snoc(v.clone());
        self.ctx.push_scope(name, label, ty);
        v
    }

    /// Introduce a fiber variable (a generator or sub-instance import)
    /// into the fiber scope, returning its neutral value.
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
        (FiberTmS::meta(tm_m), FiberTmV::meta(tm_m), FiberTyV::over(Vec::new()))
    }

    fn fiber_syn_error(&mut self, msg: impl Into<String>) -> (FiberTmS, FiberTmV, FiberTyV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.fiber_syn_hole()
    }

    fn fiber_chk_error(&mut self, msg: impl Into<String>) -> (FiberTmS, FiberTmV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        let tm_m = self.fresh_meta();
        (FiberTmS::meta(tm_m), FiberTmV::meta(tm_m))
    }

    /// Synthesize a fiber term and its fiber type. A fiber term is a
    /// generator/import variable, a projection out of a sub-instance
    /// (`we.e`), or a codomain-morphism application (`src(we.e)`).
    fn fiber_syn(&mut self, n: &FNtn) -> (FiberTmS, FiberTmV, FiberTyV) {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => match elab.lookup_fiber_tm(name_seg(*name)) {
                Some(r) => r,
                None => elab.fiber_syn_error(format!("no such fiber element {name}")),
            },
            // Projection of a generator out of a sub-instance import: `we.e`.
            App1(recv_n, L(_, Field(f))) => {
                let (recv_s, recv_v, recv_ty) = elab.fiber_syn(recv_n);
                let FiberTyV_::Record(r) = &*recv_ty else {
                    return elab
                        .fiber_syn_error("can only project a generator out of a sub-instance");
                };
                let fname = name_seg(*f);
                let flabel = label_seg(*f);
                let Some(field_ty) = r.get(fname).cloned() else {
                    return elab
                        .fiber_syn_error(format!("no such generator {fname} in sub-instance"));
                };
                (
                    FiberTmS::proj(recv_s, fname, flabel),
                    FiberTmV::proj(recv_v, fname, flabel),
                    field_ty,
                )
            }
            // Codomain-morphism application: `f(arg)`.
            App1(L(_, Var(f)), arg_n) => {
                // A display label for the argument, used only in errors.
                let label = match arg_n.ast0() {
                    Var(x) => x.to_string(),
                    App1(_, L(_, Field(fld))) => fld.to_string(),
                    _ => "argument".to_string(),
                };
                let (arg_s, arg_v, arg_ty) = elab.fiber_syn(arg_n);
                elab.apply_codomain_morphism(f, arg_s, arg_v, arg_ty, &label)
            }
            _ => elab.fiber_syn_error(
                "expected a fiber element: a generator, a projection `we.e`, or a \
                 codomain-morphism application `f(..)`",
            ),
        }
    }

    /// Check a fiber term against an expected fiber type. Fiber terms are
    /// all synthesizing, so this synthesizes and checks convertibility.
    fn fiber_chk(&mut self, expected: &FiberTyV, n: &FNtn) -> (FiberTmS, FiberTmV) {
        let (s, v, ty) = self.fiber_syn(n);
        if let Err(e) = self.evaluator().convertible_fiber_ty(&ty, expected) {
            return self
                .fiber_chk_error(format!("fiber element has the wrong type:\n{}", e.pretty()));
        }
        (s, v)
    }

    /// Elaborate a fiber-type annotation. Used for sub-instance imports
    /// (`we : Edge`, where `Edge` names a top-level instance) and anonymous
    /// equations (`name : (a == b)`).
    fn fiber_ty(&mut self, n: &FNtn) -> Option<(FiberTyS, FiberTyV)> {
        match n.ast0() {
            Var(name) => {
                let topvar = name_seg(*name);
                match self.toplevel.declarations.get(&topvar) {
                    Some(TopDecl::Instance(i)) => Some((i.stx.clone(), i.val.clone())),
                    _ => self
                        .error(format!("{name} must reference a top-level instance declaration")),
                }
            }
            App2(L(_, Keyword("==")), a_n, b_n) => {
                let (a_s, a_v, a_ty) = self.fiber_syn(a_n);
                let (b_s, b_v, b_ty) = self.fiber_syn(b_n);
                if let Err(e) = self.evaluator().convertible_fiber_ty(&a_ty, &b_ty) {
                    return self.error(format!(
                        "equation sides have inconvertible fiber types:\n{}",
                        e.pretty()
                    ));
                }
                let FiberTyV_::Over(path) = &*a_ty else {
                    return self.error(
                        "instance equations must be between elements over an object \
                         (fiber elements); morphism equations constrain the model, not \
                         an instance",
                    );
                };
                let over_s = FiberTyS::over(path.clone());
                Some((FiberTyS::id(over_s, a_s, b_s), FiberTyV::id(a_ty.clone(), a_v, b_v)))
            }
            _ => self.error("expected an instance name or an equation `a == b`"),
        }
    }

    /// The unit type, elaborated as the empty record — i.e. the empty
    /// model. `Unit` and `tt` are surface sugar for the empty record type
    /// and its unique element, the empty cons `[]`.
    fn empty_record_ty(&self) -> (BaseTyS, BaseTyV) {
        (BaseTyS::record(Row::empty()), BaseTyV::empty_record())
    }

    /// Apply a codomain morphism `f` to an already-elaborated argument
    /// of fiber type. Shared by the bare `f(x)` and `f(receiver.fld)`
    /// arms of [`Self::syn`].
    fn apply_codomain_morphism(
        &mut self,
        f: &str,
        arg_s: FiberTmS,
        arg_v: FiberTmV,
        arg_ty: FiberTyV,
        arg_label_str: &str,
    ) -> (FiberTmS, FiberTmV, FiberTyV) {
        let Some(codomain) = self.instance_codomain() else {
            return self.fiber_syn_error(
                "applied codomain morphism is only allowed inside an instance body",
            );
        };
        let FiberTyV_::Over(src_path) = &*arg_ty else {
            return self.fiber_syn_error(format!(
                "argument {arg_label_str} is not an element over an object",
            ));
        };
        let f_label = label_seg(f);
        let f_name = name_seg(f);
        let Some(mor_ty_s) = codomain.fields.get(f_name) else {
            return self.fiber_syn_error(format!("no such codomain morphism {f_name}"));
        };
        let BaseTyS_::Morphism(_, dom_s, cod_s) = &**mor_ty_s else {
            return self.fiber_syn_error(format!("codomain field {f_name} is not a morphism"));
        };
        let (Some(dom_path), Some(cod_path)) = (tms_to_path(dom_s), tms_to_path(cod_s)) else {
            return self.fiber_syn_error(format!(
                "codomain morphism {f_name} has non-path dom/cod; \
                 applied-morphism syntax requires both to be paths",
            ));
        };
        if dom_path != *src_path {
            return self.fiber_syn_error(format!(
                "codomain morphism {f_name} has source path differing from the argument",
            ));
        }
        (
            FiberTmS::over_app(f_name, f_label, cod_path.clone(), arg_s),
            FiberTmV::over_app(f_name, f_label, cod_path.clone(), arg_v),
            FiberTyV::over(cod_path),
        )
    }

    /// Elaborate an instance body — a tuple of `name : type`, `field
    /// := [names]`, and `mor(arg) := target` clauses — against the
    /// enclosing codomain model. Produces the instance as a fiber
    /// [`Record`](FiberTyS_::Record): generators become
    /// [`Over`](FiberTyS_::Over) fields, sub-instance imports nested
    /// [`Record`](FiberTyS_::Record) fields, and equations
    /// [`Id`](FiberTyS_::Id) fields.
    ///
    /// The codomain model is bound into the *base* context as a `self`-typed
    /// record variable (and the binding is dropped on exit) so that
    /// applied-codomain-morphism syntax resolves morphisms by name. The
    /// instance's own generators and imports live in the separate *fiber*
    /// scope.
    fn instance_body(&mut self, codomain: &RecordV, n: &FNtn) -> (FiberTyS, FiberTyV) {
        let c = self.checkpoint();
        let binder = name_seg(Self::CODOMAIN_BINDER);
        self.intro(
            binder,
            label_seg(Self::CODOMAIN_BINDER),
            Some(BaseTyV::record(codomain.clone())),
        );
        let result = self.instance_body_inner(n);
        self.reset_to(c);
        result
    }

    /// Elaborate the clauses of an instance body (the f-notation `n`) into a
    /// fiber [`Record`](FiberTyS_::Record). The codomain is already set on
    /// the context by [`Self::instance_body`].
    ///
    /// Steps:
    /// 1. Set up empty accumulators (see below) for the clauses to fill.
    /// 2. Walk each clause, dispatching on its surface shape into one of
    ///    the forms below. A malformed clause reports an error and sets
    ///    `failed`, but the walk continues so a single pass surfaces as
    ///    many errors as possible.
    /// 3. If any clause failed, return an empty instance (errors already
    ///    reported); otherwise assemble the accumulators into the paired
    ///    instance terms.
    ///
    /// The clause forms, in match order:
    /// - `name : type` — dispatched on the *elaborated type's* shape: a
    ///   fiber type `Over(p)` declares a generator; a record type is a
    ///   sub-instance import (must name a top-level instance def); an
    ///   identity type `a == b` is an anonymous equation.
    /// - `field := [k := t, ...]` — mapping-literal: sugar for a batch of
    ///   per-key equations `field(k) := t` against a codomain *morphism*.
    /// - `field := [n1, n2, ...]` — set-literal: declares generators in
    ///   the fiber over a codomain *object* `field`.
    /// - `mor(arg) := target` — a single equation witness.
    fn instance_body_inner(&mut self, n: &FNtn) -> (FiberTyS, FiberTyV) {
        let mut elab = self.enter(n.loc());
        let empty = || (FiberTyS::record(Row::empty()), FiberTyV::record(Row::empty()));
        let Tuple(field_ns) = n.ast0() else {
            elab.error::<()>("expected a tuple instance body");
            return empty();
        };
        // The instance is assembled as a fiber record: a generator is an
        // `Over` field, a sub-instance import a nested `Record` field, and
        // an equation an `Id` field (with a synthetic `_eqN` name).
        // `fields_s`/`fields_v` hold the syntactic / value rows; `eq_count`
        // names successive equation fields.
        let mut fields_s: Row<FiberTyS> = Row::empty();
        let mut fields_v: Row<FiberTyV> = Row::empty();
        let mut eq_count = 0usize;
        let mut failed = false;

        for field_n in field_ns.iter() {
            elab.loc = Some(field_n.loc());
            match field_n.ast0() {
                // `name : type` — a sub-instance import (`we : Edge`) or an
                // anonymous equation (`name : (a == b)`), dispatched on the
                // elaborated fiber type's shape.
                App2(L(_, Keyword(":")), L(_, Var(name)), ty_n) => {
                    let n_seg = name_seg(*name);
                    let label = label_seg(*name);
                    let Some((ty_s, ty_v)) = elab.fiber_ty(ty_n) else {
                        failed = true;
                        continue;
                    };
                    match &*ty_v {
                        // A sub-instance import: bind it in the fiber scope
                        // (so `name.gen` projections resolve) and record it.
                        FiberTyV_::Record(_) => {
                            elab.intro_fiber(n_seg, label, ty_v.clone());
                            fields_s.insert(n_seg, label, ty_s);
                            fields_v.insert(n_seg, label, ty_v);
                        }
                        // A named equation (e.g. `eq : (.src(e) == .src(f))`).
                        FiberTyV_::Id(_, _, _) => {
                            fields_s.insert(n_seg, label, ty_s);
                            fields_v.insert(n_seg, label, ty_v);
                        }
                        FiberTyV_::Over(_) => {
                            elab.error::<()>(format!(
                                "instance clause {name} cannot be annotated with a bare \
                                 element type",
                            ));
                            failed = true;
                        }
                    }
                }
                // `field := [k1 := t1, ...]` — mapping-literal: a batch of
                // per-key equations against a morphism-typed codomain field.
                App2(L(_, Keyword(":=")), L(_, Var(field_name)), L(_, Tuple(entries)))
                    if !entries.is_empty()
                        && entries
                            .iter()
                            .all(|e| matches!(e.ast0(), App2(L(_, Keyword(":=")), _, _))) =>
                {
                    let Some(codomain) = elab.instance_codomain() else {
                        elab.error::<()>(
                            "mapping-literal assignment is only allowed inside an instance body",
                        );
                        failed = true;
                        continue;
                    };
                    let f_seg = name_seg(*field_name);
                    let f_label = label_seg(*field_name);
                    let Some(mor_ty_s) = codomain.fields.get(f_seg) else {
                        elab.error::<()>(format!("no such codomain field {field_name}"));
                        failed = true;
                        continue;
                    };
                    let BaseTyS_::Morphism(_, dom_s, cod_s) = &**mor_ty_s else {
                        elab.error::<()>(format!(
                            "mapping-literal assignment requires field {field_name} to be \
                             morphism-typed",
                        ));
                        failed = true;
                        continue;
                    };
                    let (Some(dom_path), Some(cod_path)) = (tms_to_path(dom_s), tms_to_path(cod_s))
                    else {
                        elab.error::<()>(format!(
                            "codomain morphism {field_name} has non-path dom/cod; \
                             mapping-literal assignment requires both to be paths",
                        ));
                        failed = true;
                        continue;
                    };
                    let mut entry_failed = false;
                    for entry_n in entries.iter() {
                        elab.loc = Some(entry_n.loc());
                        let App2(L(_, Keyword(":=")), key_n, target_n) = entry_n.ast0() else {
                            unreachable!("guard ensured all entries are `:=` clauses");
                        };
                        let (key_s, key_v, key_ty) = elab.fiber_syn(key_n);
                        let FiberTyV_::Over(key_path) = &*key_ty else {
                            elab.error::<()>(format!(
                                "mapping-literal key is not an element over {}",
                                object_path_str(&dom_path),
                            ));
                            entry_failed = true;
                            break;
                        };
                        if key_path != &dom_path {
                            elab.error::<()>(format!(
                                "mapping-literal key is an element over {}, but {field_name} expects an element over {}",
                                object_path_str(key_path),
                                object_path_str(&dom_path),
                            ));
                            entry_failed = true;
                            break;
                        }
                        let lhs_ty_v = FiberTyV::over(cod_path.clone());
                        let lhs_s = FiberTmS::over_app(f_seg, f_label, cod_path.clone(), key_s);
                        let lhs_v = FiberTmV::over_app(f_seg, f_label, cod_path.clone(), key_v);
                        let (rhs_s, rhs_v) = elab.fiber_chk(&lhs_ty_v, target_n);
                        let (eqn, eql) = next_eq_field(&mut eq_count);
                        fields_s.insert(
                            eqn,
                            eql,
                            FiberTyS::id(FiberTyS::over(cod_path.clone()), lhs_s, rhs_s),
                        );
                        fields_v.insert(eqn, eql, FiberTyV::id(lhs_ty_v, lhs_v, rhs_v));
                    }
                    if entry_failed {
                        failed = true;
                        continue;
                    }
                }
                // `field := [n1, n2, ...]` — set-literal: declare generators
                // in the fiber over an object-typed codomain field.
                App2(L(_, Keyword(":=")), L(_, Var(field_name)), L(_, Tuple(name_ns))) => {
                    let Some(codomain) = elab.instance_codomain() else {
                        elab.error::<()>(
                            "set-literal field assignment is only allowed inside an \
                             instance body",
                        );
                        failed = true;
                        continue;
                    };
                    let f_seg = name_seg(*field_name);
                    let f_label = label_seg(*field_name);
                    let Some(field_ty_s) = codomain.fields.get(f_seg) else {
                        elab.error::<()>(format!("no such codomain field {field_name}"));
                        failed = true;
                        continue;
                    };
                    if !matches!(&**field_ty_s, BaseTyS_::Object(_)) {
                        elab.error::<()>(format!(
                            "set-literal assignment requires field {field_name} to be \
                             object-typed",
                        ));
                        failed = true;
                        continue;
                    }
                    let path = vec![(f_seg, f_label)];
                    for name_n in name_ns.iter() {
                        let Var(gen_name) = name_n.ast0() else {
                            elab.loc = Some(name_n.loc());
                            elab.error::<()>("set-literal entries must be bare names");
                            failed = true;
                            break;
                        };
                        let gen_seg = name_seg(*gen_name);
                        let gen_label = label_seg(*gen_name);
                        elab.intro_fiber(gen_seg, gen_label, FiberTyV::over(path.clone()));
                        fields_s.insert(gen_seg, gen_label, FiberTyS::over(path.clone()));
                        fields_v.insert(gen_seg, gen_label, FiberTyV::over(path.clone()));
                    }
                }
                // `mor(arg) := target` — a single equation witness.
                App2(L(_, Keyword(":=")), lhs_n, rhs_n) => {
                    let (lhs_s, lhs_v, lhs_ty) = elab.fiber_syn(lhs_n);
                    let FiberTyV_::Over(over_path) = &*lhs_ty else {
                        elab.loc = Some(lhs_n.loc());
                        elab.error::<()>(
                            "mapping-entry clause `mor(arg) := target` requires the LHS \
                             to be an element over an object (a fiber element); morphism \
                             equations constrain the model, not an instance",
                        );
                        failed = true;
                        continue;
                    };
                    let over_path = over_path.clone();
                    let (rhs_s, rhs_v) = elab.fiber_chk(&lhs_ty, rhs_n);
                    let (eqn, eql) = next_eq_field(&mut eq_count);
                    fields_s.insert(
                        eqn,
                        eql,
                        FiberTyS::id(FiberTyS::over(over_path.clone()), lhs_s, rhs_s),
                    );
                    fields_v.insert(
                        eqn,
                        eql,
                        FiberTyV::id(FiberTyV::over(over_path), lhs_v, rhs_v),
                    );
                }
                _ => {
                    elab.error::<()>(
                        "expected fields in the form `name : type`, \
                         `field := [names]`, or `mor(arg) := target`",
                    );
                    failed = true;
                }
            }
        }

        // On any failure, errors are already reported, so bail with an
        // empty instance rather than a half-built one.
        if failed {
            return empty();
        }
        (FiberTyS::record(fields_s), FiberTyV::record(fields_v))
    }

    fn binding(&mut self, n: &FNtn) -> Option<(VarName, LabelSegment, BaseTyS, BaseTyV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            App2(L(_, Keyword(":")), L(_, Var(name)), ty_n) => {
                let (ty_s, ty_v) = elab.ty(ty_n);
                Some((name_seg(*name), label_seg(*name), ty_s, ty_v))
            }
            _ => elab.error("unexpected notation for binding"),
        }
    }

    fn lookup_ty(&mut self, name: VarName) -> (BaseTyS, BaseTyV) {
        let qname = QualifiedName::single(name);
        if let Some(ob_type) = self.theory().basic_ob_type(qname) {
            (BaseTyS::object(ob_type.clone()), BaseTyV::object(ob_type))
        } else if let Some(d) = self.toplevel.declarations.get(&name) {
            match d {
                TopDecl::Type(t) => {
                    if t.theory == self.theory {
                        (BaseTyS::topvar(name), t.val.clone())
                    } else {
                        self.ty_error(format!(
                            "{name} refers to a type in theory {}, expected a type in theory {}",
                            t.theory, self.theory
                        ))
                    }
                }
                // An instance is a fiber type, not a base type. It can only
                // appear as the annotation of a sub-instance import inside an
                // instance body (handled by `fiber_ty`), not in base-type
                // position.
                TopDecl::Instance(_) => self.ty_error(format!(
                    "{name} refers to an instance, which is not a base type; \
                     an instance can only be imported inside another instance body"
                )),
                TopDecl::Def(_) => self.ty_error(format!("{name} refers to a term not a type")),
            }
        } else {
            self.ty_error(format!("no such type {name} defined"))
        }
    }
    fn morphism_ty(&mut self, n: &FNtn) -> Option<(MorType, ObType, ObType)> {
        let elab = self.enter(n.loc());
        let theory = elab.theory();
        match n.ast0() {
            App1(L(_, Keyword("Hom")), L(_, Var(name))) => {
                let qname = QualifiedName::single(name_seg(*name));
                if let Some(ob_type) = theory.basic_ob_type(qname) {
                    if let Some(hom_type) = theory.hom_type(ob_type.clone()) {
                        Some((hom_type, ob_type.clone(), ob_type))
                    } else {
                        elab.error(format!("object type {name} does not have hom type"))
                    }
                } else {
                    elab.error(format!("no such object type {name}"))
                }
            }
            Var(name) => {
                let qname = QualifiedName::single(name_seg(*name));
                if let Some(mor_type) = theory.basic_mor_type(qname) {
                    let dom = theory.src_type(&mor_type);
                    let cod = theory.tgt_type(&mor_type);
                    Some((mor_type, dom, cod))
                } else {
                    elab.error(format!("no such morphism type {name}"))
                }
            }
            _ => elab.error("unexpected notation for morphism type"),
        }
    }

    fn path(&mut self, n: &FNtn) -> Option<Vec<(NameSegment, LabelSegment)>> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Field(f) => Some(vec![(name_seg(*f), label_seg(*f))]),
            App1(p_n, L(_, Field(f))) => {
                let mut p = elab.path(p_n)?;
                p.push((name_seg(*f), label_seg(*f)));
                Some(p)
            }
            _ => elab.error("unexpected notation for path"),
        }
    }

    #[allow(clippy::type_complexity)]
    fn specialization(
        &mut self,
        n: &FNtn,
    ) -> Option<(Vec<(NameSegment, LabelSegment)>, BaseTyS, BaseTyV)> {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            App2(L(_, Keyword(":")), p_n, ty_n) => {
                let p = elab.path(p_n)?;
                let (ty_s, ty_v) = elab.ty(ty_n);
                Some((p, ty_s, ty_v))
            }
            App2(L(_, Keyword(":=")), p_n, tm_n) => {
                let p = elab.path(p_n)?;
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n);
                Some((
                    p,
                    BaseTyS::sing(elab.evaluator().quote_ty(&ty_v), tm_s),
                    BaseTyV::sing(ty_v, tm_v),
                ))
            }
            _ => elab.error("unexpected notation for specialization"),
        }
    }

    /// Elaborates a type from notation, returning both syntax and value.
    pub fn ty(&mut self, n: &FNtn) -> (BaseTyS, BaseTyV) {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => elab.lookup_ty(name_seg(*name)),
            Keyword("Unit") => elab.empty_record_ty(),
            App1(L(_, Prim("sing")), tm_n) => {
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n);
                (BaseTyS::sing(elab.evaluator().quote_ty(&ty_v), tm_s), BaseTyV::sing(ty_v, tm_v))
            }
            App1(mt_n, L(_, Tuple(domcod_n))) => {
                let [dom_n, cod_n] = domcod_n.as_slice() else {
                    return elab.ty_error("expected two arguments for morphism type");
                };
                let Some((mt, dom_ty, cod_ty)) = elab.morphism_ty(mt_n) else {
                    return elab.ty_hole();
                };
                let (dom_s, dom_v) = elab.chk(&BaseTyV::object(dom_ty.clone()), dom_n);
                let (cod_s, cod_v) = elab.chk(&BaseTyV::object(cod_ty.clone()), cod_n);
                (
                    BaseTyS::morphism(mt.clone(), dom_s, cod_s),
                    BaseTyV::morphism(mt.clone(), dom_v, cod_v),
                )
            }
            Tuple(field_ns) => {
                let mut field_ty_vs = Vec::<(FieldName, (LabelSegment, BaseTyV))>::new();
                let mut failed = false;
                let self_var = elab.intro(name_seg("self"), label_seg("self"), None).unwrap_neu();
                let c = elab.checkpoint();
                for field_n in field_ns.iter() {
                    elab.loc = Some(field_n.loc());
                    let Some((name, label, ty_n)) = (match field_n.ast0() {
                        App2(L(_, Keyword(":")), L(_, Var(name)), ty_n) => {
                            let name_seg = name_seg(*name);
                            Some((name_seg, label_seg(*name), ty_n))
                        }
                        _ => elab.error("expected fields in the form <name> : <type>"),
                    }) else {
                        failed = true;
                        continue;
                    };
                    let (_, ty_v) = elab.ty(ty_n);
                    field_ty_vs.push((name, (label, ty_v.clone())));
                    elab.ctx.push_scope(name, label, Some(ty_v.clone()));
                    elab.ctx.env =
                        elab.ctx.env.snoc(TmV::neu(TmN::proj(self_var.clone(), name, label), ty_v));
                }
                if failed {
                    return elab.ty_hole();
                }
                elab.reset_to(c);
                let field_tys: Row<_> = field_ty_vs
                    .iter()
                    .map(|(name, (label, ty_v))| (*name, (*label, elab.evaluator().quote_ty(ty_v))))
                    .collect();
                let r_v = RecordV::new(elab.ctx.env.clone(), field_tys.clone(), Dtry::empty());
                (BaseTyS::record(field_tys), BaseTyV::record(r_v))
            }
            App2(L(_, Keyword("&")), ty_n, L(_, Tuple(specialization_ns))) => {
                let (ty_s, mut ty_v) = elab.ty(ty_n);
                let mut specializations = Vec::new();
                // Approach:
                //
                // 1. Write a try_specialize method which attempts to specialize ty_v
                // with a given path + type (e.g. `.x.y : @sing a`), returning a new
                // type or an error message.
                // 2. Iteratively apply try_specialize to each specialization in turn.
                for specialization_n in specialization_ns.iter() {
                    elab.loc = Some(specialization_n.loc());
                    let Some((path, sty_s, sty_v)) = elab.specialization(specialization_n) else {
                        return elab.ty_hole();
                    };
                    match elab.evaluator().try_specialize(&ty_v, &path, sty_v) {
                        Ok(specialized) => {
                            ty_v = specialized;
                            specializations.push((path, sty_s));
                        }
                        Err(s) => {
                            return elab
                                .ty_error(format!("Failed to specialize:\n... because {s}"));
                        }
                    }
                }
                (BaseTyS::specialize(ty_s, specializations), ty_v)
            }
            App2(L(_, Keyword("==")), tm1_n, tm2_n) => {
                let (tm1_s, tm1_v, tm1_ty) = elab.syn(tm1_n);
                let (tm2_s, tm2_v, tm2_ty) = elab.syn(tm2_n);
                if !matches!(&*tm1_ty, BaseTyV_::Morphism(_, _, _)) {
                    elab.loc = Some(tm1_n.loc());
                    return elab.ty_error(
                        "Equality types are only supported for morphisms; equations \
                         between instance elements live inside an instance body",
                    );
                }
                if let Err(e) = elab.evaluator().convertible_ty(&tm1_ty, &tm2_ty) {
                    let eval = elab.evaluator();
                    return elab.ty_error(format!(
                        "types {} and {} are not convertible:\n{}",
                        eval.quote_ty(&tm1_ty),
                        eval.quote_ty(&tm2_ty),
                        e.pretty()
                    ));
                }
                let eq_ty_s = BaseTyS::id(elab.evaluator().quote_ty(&tm1_ty), tm1_s, tm2_s);
                let eq_ty_v = BaseTyV::id(tm1_ty, tm1_v, tm2_v);
                (eq_ty_s, eq_ty_v)
            }
            _ => elab.ty_error("unexpected notation for type"),
        }
    }

    fn lookup_tm(&mut self, name: Ustr) -> (TmS, TmV, BaseTyV) {
        let label = label_seg(name);
        let name = name_seg(name);
        if let Some((i, _, ty)) = self.ctx.lookup(name) {
            (
                TmS::var(i, name, label),
                self.ctx.env.get(*i).unwrap().clone(),
                ty.clone().unwrap(),
            )
        } else if let Some(d) = self.toplevel.lookup(name) {
            match d {
                TopDecl::Type(_) => self.syn_error(format!("{name} refers type, not term")),
                // A nullary `Def` (a closed term, e.g. `tt : Unit`) used as a
                // bare name; evaluate its body and return type in the empty
                // context.
                TopDecl::Def(d) if d.args.is_empty() => {
                    let def = d.clone();
                    let eval = self.evaluator();
                    (TmS::topapp(name, vec![]), eval.eval_tm(&def.body), eval.eval_ty(&def.ret_ty))
                }
                TopDecl::Def(_) => self.syn_error(format!("{name} must be applied to arguments")),
                TopDecl::Instance(_) => self.syn_error(format!(
                    "{name} refers to an instance; use it in type position to import it, \
                     not as a term"
                )),
            }
        } else {
            self.syn_error(format!("no such variable {name}"))
        }
    }

    /// Elaborates a term from notation, returning syntax, value, and synthesized type.
    fn syn(&mut self, n: &FNtn) -> (TmS, TmV, BaseTyV) {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => elab.lookup_tm(ustr(name)),
            App1(tm_n, L(_, Field(f))) => {
                // A top-level instance has no term-position use, so projecting
                // a field out of one would otherwise produce a confusing
                // "not a term"/"not a record" cascade; catch it here with the
                // targeted elimination message.
                if let Var(inst) = tm_n.ast0()
                    && matches!(
                        elab.toplevel.declarations.get(&name_seg(*inst)),
                        Some(TopDecl::Instance(_))
                    )
                {
                    return elab.syn_error(
                        "cannot project a field out of an instance; an instance is \
                         eliminated by mapping out of it, not by projection",
                    );
                }
                let (tm_s, tm_v, ty_v) = elab.syn(tm_n);
                let BaseTyV_::Record(r) = &*ty_v else {
                    return elab.syn_error("can only project from record type");
                };
                let label = label_seg(*f);
                let f = name_seg(*f);
                if !r.fields.has(f) {
                    return elab.syn_error(format!("no such field {f}"));
                }
                (
                    TmS::proj(tm_s, f, label),
                    elab.evaluator().proj(&tm_v, f, label),
                    elab.evaluator().field_ty(&ty_v, &tm_v, f),
                )
            }
            // Codomain-morphism application (`src(we.e)`, `f(x)`) is fiber
            // syntax, elaborated by `fiber_syn` inside an instance body — it
            // is not a base term, so base `syn` does not handle it.
            App1(L(_, Prim("id")), ob_n) => {
                let (ob_s, ob_v, ob_t) = elab.syn(ob_n);
                let BaseTyV_::Object(ob_type) = &*ob_t else {
                    return elab.syn_error("can only apply @id to objects");
                };
                let Some(mor_type) = elab.theory().hom_type(ob_type.clone()) else {
                    return elab.syn_error("object type does not have a hom type");
                };
                (
                    TmS::id(ob_s),
                    TmV::id(ob_v.clone()),
                    BaseTyV::morphism(mor_type, ob_v.clone(), ob_v),
                )
            }
            App1(L(_, Prim("tab")), mor_n) => {
                let (mor_s, mor_v, mor_t) = elab.syn(mor_n);
                let BaseTyV_::Morphism(mor_type, _, _) = &*mor_t else {
                    return elab.syn_error("can only apply @tab to morphisms");
                };
                let Some(ob_type) = elab.theory().tabulator(mor_type.clone()) else {
                    return elab.syn_error("theory does not have tabulators");
                };
                (TmS::tab(mor_s), TmV::tab(mor_v.clone()), BaseTyV::object(ob_type))
            }
            App1(L(_, Prim(name)), ob_n) => {
                let name = name_seg(*name);
                let Some(ob_op) = elab.theory().basic_ob_op([name].into()) else {
                    let th_name = elab.theory.name.to_string();
                    return elab.syn_error(format!("operation @{name} not in theory {th_name}"));
                };
                let dom = elab.theory().ob_op_dom(&ob_op);
                let (arg_s, arg_v) = elab.chk(&BaseTyV::object(dom), ob_n);
                let cod = elab.theory().ob_op_cod(&ob_op);
                (TmS::ob_app(name, arg_s), TmV::app(name, arg_v), BaseTyV::object(cod))
            }
            App2(L(_, Keyword("*")), f_n, g_n) => {
                let (f_s, f_v, f_ty) = elab.syn(f_n);
                let (g_s, g_v, g_ty) = elab.syn(g_n);
                let BaseTyV_::Morphism(f_mt, f_dom, f_cod) = &*f_ty else {
                    elab.loc = Some(f_n.loc());
                    return elab.syn_error("expected a morphism");
                };
                let BaseTyV_::Morphism(g_mt, g_dom, g_cod) = &*g_ty else {
                    elab.loc = Some(g_n.loc());
                    return elab.syn_error("expected a morphism");
                };
                let theory = elab.theory();
                if theory.tgt_type(f_mt) != theory.src_type(g_mt) {
                    return elab.syn_error("incompatible morphism types");
                }
                if let Err(s) = elab.evaluator().equal_tm(f_cod, g_dom) {
                    let f_cod_s = elab.evaluator().quote_tm(f_cod);
                    let g_dom_s = elab.evaluator().quote_tm(g_dom);
                    return elab.syn_error(format!(
                        "codomain {} and domain {} not equal:\n...because {}",
                        f_cod_s,
                        g_dom_s,
                        s.pretty(),
                    ));
                }
                (
                    TmS::compose(f_s, g_s),
                    TmV::compose(f_v, g_v),
                    BaseTyV::morphism(
                        elab.theory().compose_types2(f_mt.clone(), g_mt.clone()).unwrap(),
                        f_dom.clone(),
                        g_cod.clone(),
                    ),
                )
            }
            App1(L(_, Var(tv)), L(_, Tuple(args_n))) => {
                let tv = name_seg(*tv);
                let Some(TopDecl::Def(d)) = elab.toplevel.lookup(tv) else {
                    return elab.syn_error(format!("no such toplevel def {tv}"));
                };
                let mut arg_stxs = Vec::new();
                let mut env = Env::nil();
                if args_n.len() != d.args.len() {
                    return elab.syn_error(format!(
                        "wrong number of args for {tv}, expected {}, got {}",
                        d.args.len(),
                        args_n.len()
                    ));
                }
                for (arg_n, (_, (_, arg_ty_s))) in args_n.iter().zip(d.args.iter()) {
                    let arg_ty_v = elab.evaluator().with_env(env.clone()).eval_ty(arg_ty_s);
                    let (arg_s, arg_v) = elab.chk(&arg_ty_v, arg_n);
                    arg_stxs.push(arg_s);
                    env = env.snoc(arg_v);
                }
                let eval = elab.evaluator().with_env(env.clone());
                (TmS::topapp(tv, arg_stxs), eval.eval_tm(&d.body), eval.eval_ty(&d.ret_ty))
            }
            Tag("tt") => {
                // `tt` is the unique element of `Unit`, i.e. the empty record `[]`.
                let (_, ty_v) = elab.empty_record_ty();
                (TmS::cons(Row::empty()), TmV::cons(Row::empty()), ty_v)
            }
            Tuple(_) => elab.syn_error("must check against a type in order to construct a record"),
            Prim("hole") => elab.syn_error("explicit hole"),
            _ => elab.syn_error("unexpected notation for term"),
        }
    }

    /// Elaborates a term from notation, checking against an expected type, and returning syntax and value.
    fn chk(&mut self, ty: &BaseTyV, n: &FNtn) -> (TmS, TmV) {
        let mut elab = self.enter(n.loc());
        match (&**ty, n.ast0()) {
            (BaseTyV_::Record(r), Tuple(field_ns)) => {
                // Ordinary record construction (a tight transformation /
                // generalized element). Instance bodies are *not* dispatched
                // here — they are introduced by the `instance` keyword, which
                // calls `instance_body` directly — so this arm has no clause
                // shape to disambiguate.
                if r.fields.len() != field_ns.len() {
                    return elab.chk_error(format!(
                        "wrong number of fields provided, expected {}, got {}",
                        r.fields.len(),
                        field_ns.len(),
                    ));
                }
                let mut field_stxs = IndexMap::new();
                let mut field_vals = IndexMap::new();
                for (field_n, (name, (label, field_ty_s))) in field_ns.iter().zip(r.fields.iter()) {
                    elab.loc = Some(field_n.loc());
                    let tm_n = match field_n.ast0() {
                        App2(L(_, Keyword(":=")), L(_, Var(given_name)), field_val_n) => {
                            if name_seg(*given_name) == *name {
                                field_val_n
                            } else {
                                return elab.chk_error(format!("unexpected field {given_name}"));
                            }
                        }
                        _ => {
                            return elab.chk_error("unexpected notation for field");
                        }
                    };
                    let v = TmV::cons(field_vals.clone().into());
                    let field_ty_v =
                        elab.evaluator().with_env(r.env.snoc(v.clone())).eval_ty(field_ty_s);
                    let (tm_s, tm_v) = elab.chk(&field_ty_v, tm_n);
                    field_stxs.insert(*name, (*label, tm_s));
                    field_vals.insert(*name, (*label, tm_v));
                }
                (TmS::cons(field_stxs.into()), TmV::cons(field_vals.into()))
            }
            (BaseTyV_::Object(ob_type), Tuple(ob_ns)) => {
                let Some(ob_type) = ob_type.clone().list_arg() else {
                    return elab.chk_error("expected to object type to be a list");
                };
                let elem_ty_v = BaseTyV::object(ob_type);
                let mut elem_stxs = Vec::new();
                let mut elem_vals = Vec::new();
                for ob_n in ob_ns {
                    elab.loc = Some(ob_n.loc());
                    let (tm_s, tm_v) = elab.chk(&elem_ty_v, ob_n);
                    elem_stxs.push(tm_s);
                    elem_vals.push(tm_v);
                }
                (TmS::list(elem_stxs), TmV::list(elem_vals))
            }
            (_, Tuple(_)) => elab.chk_error("tuple expected to be record or object/morphism type"),
            (_, Prim("hole")) => elab.chk_error("explicit hole"),
            _ => {
                let (tm_s, tm_v, synthed) = elab.syn(n);
                let eval = elab.evaluator();
                if let Err(e) = eval.convertible_ty(&synthed, ty) {
                    return elab.chk_error(format!(
                        "synthesized type {} does not match expected type {}:\n{}",
                        eval.quote_ty(&synthed),
                        eval.quote_ty(ty),
                        e.pretty()
                    ));
                }
                if let Err(e) = eval.element_of(&tm_v, ty) {
                    return elab.chk_error(format!(
                        "evaluated term {} is not an element of specialized type {}:\n{}",
                        eval.quote_tm(&tm_v),
                        eval.quote_ty(ty),
                        e.pretty()
                    ));
                }
                (tm_s, tm_v)
            }
        }
    }
}

/// Read off a path of `(name, label)` segments from a term that is a chain
/// of projections rooted in a variable.
///
/// The leading variable is treated as the implicit root (e.g., the `self`
/// of an enclosing record) and contributes no segment. So `Var(self)`
/// returns `[]` and `Proj(Var(self), E, E_label)` returns `[(E, E_label)]`,
/// matching the path representation produced by the surface `.E` syntax.
/// Returns `None` if the term has any other shape.
/// Render an object path (e.g. `[(V, V)]`) as a dotted label string
/// (e.g. `V`, or `we.E` for a nested path) for use in error messages.
fn object_path_str(path: &[(FieldName, LabelSegment)]) -> String {
    path.iter().map(|(_, seg)| seg.to_string()).collect::<Vec<_>>().join(".")
}

/// The synthetic field name/label `_eqN` for the next auto-named equation
/// field of an instance record, advancing the counter.
fn next_eq_field(eq_count: &mut usize) -> (FieldName, LabelSegment) {
    let key = format!("_eq{}", *eq_count);
    *eq_count += 1;
    (name_seg(key.as_str()), label_seg(key.as_str()))
}

fn tms_to_path(tm: &TmS) -> Option<Vec<(NameSegment, LabelSegment)>> {
    match &**tm {
        TmS_::Var(_, _, _) => Some(vec![]),
        TmS_::Proj(inner, name, label) => {
            let mut p = tms_to_path(inner)?;
            p.push((*name, *label));
            Some(p)
        }
        _ => None,
    }
}

// NOTE: Most tests for the text elaborator are in the `examples` dir.
#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use crate::stdlib;
    use crate::tt::modelgen::Model;

    #[test]
    fn generate_model_from_text() {
        let th = Rc::new(stdlib::th_signed_category());
        let source = "[
            x : Object,
            loop : Negative[x, x]
        ]";
        let model = Model::from_text(&th.clone().into(), source).unwrap();
        let model = model.as_discrete().unwrap();
        assert_eq!(model, stdlib::models::negative_loop(th));
    }

    /// Check that a commutative square really produces a model with exactly one equation.
    #[test]
    fn generate_model_with_eqn() {
        let th = Rc::new(stdlib::th_schema()).into();
        let source = "[
            NW : Entity,
            NE : Entity,
            SW : Entity,
            SE : Entity,
            t : (Hom Entity)[NW,NE],
            l : (Hom Entity)[NW,SW],
            r : (Hom Entity)[NE,SE],
            b : (Hom Entity)[SW, SE],
            comm : (t * r == l * b)
        ]";
        let model = Model::from_text(&th, source).unwrap().as_discrete().unwrap();
        let eqns: Vec<_> = model.category.equations().collect();
        assert_eq!(eqns.len(), 1);
    }

    #[test]
    fn text_error_reporting() {
        let th = Rc::new(stdlib::th_schema()).into();

        let result = Model::from_text(&th, "[ : Entit]");
        let expected = expect![[r#"
            error[elab]: expected fields in the form <name> : <type>
            --> <none>:1:3
            1| [ : Entit]
            1|   ^^^^^^^
        "#]];
        expected.assert_eq(&result.err().unwrap());

        let result = Model::from_text(&th, "[x : Entity, f : Hom(Entit)[x,x]]");
        let expected = expect![[r#"
            error[elab]: no such object type Entit
            --> <none>:1:18
            1| [x : Entity, f : Hom(Entit)[x,x]]
            1|                  ^^^^^^^^^^
        "#]];
        expected.assert_eq(&result.err().unwrap());

        let result = Model::from_text(&th, "[x : Entity, f : Hom(Entity)[x,y]]");
        let expected = expect![[r#"
            error[elab]: no such variable y
            --> <none>:1:32
            1| [x : Entity, f : Hom(Entity)[x,y]]
            1|                                ^
            error[elab]: synthesized type ?1 does not match expected type Entity:
            tried to convert between types of different type constructors
            --> <none>:1:32
            1| [x : Entity, f : Hom(Entity)[x,y]]
            1|                                ^
        "#]];
        expected.assert_eq(&result.err().unwrap());
    }
}
