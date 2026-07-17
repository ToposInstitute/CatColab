//! Elaboration from plain text for DoubleTT.

use fnotation::*;
use scopeguard::{ScopeGuard, guard};

use fnotation::{ParseConfig, parser::Prec};
use tattle::declare_error;

use super::fiber_elab::{CODOMAIN_BINDER, FiberElab, FiberError, path_str};
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
                let (ctx_ns, n) = self.expr_with_context(tn.body);
                // `norm [inst] <fiber-term>`: normalize a single instance
                // term in the scope of the existing instance `inst`, showing
                // its flat (composite) normal form. A fiber term is neutral
                // at the type-theory level; the composition happens when it is
                // extracted to a model-instance term (see
                // [`normalize_instance_term`]).
                if let [single] = ctx_ns
                    && let Var(inst_name) = single.ast0()
                    && let Some(TopDecl::Instance(inst)) =
                        toplevel.declarations.get(&name_seg(*inst_name))
                {
                    let mut elab = self.elaborator(&inst.theory, toplevel);
                    elab.enter_instance(inst)?;
                    let (_, tm_v, ty_v) = elab.fiber_syn(n);
                    let FiberTyV_::Over(over) = &*ty_v else {
                        return elab
                            .error("norm expects an instance element (a term over an object)");
                    };
                    let over = over.clone();
                    return match normalize_instance_term(
                        toplevel,
                        &inst.theory.definition,
                        inst,
                        &tm_v,
                        &over,
                    ) {
                        Ok(nt) => Some(TopElabResult::Output(nt.render())),
                        Err(msg) => self.error(tn.loc, msg),
                    };
                }
                let theory = self.get_theory(tn.loc)?;
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

    /// The codomain model of the instance body currently being
    /// elaborated, if any. Its fields are the codomain's generators,
    /// looked up by name by the instance-clause arms.
    ///
    /// The model is held as a record variable in the context under the
    /// reserved [`CODOMAIN_BINDER`] name (see
    /// [`Self::instance_body`]).
    fn instance_codomain(&self) -> Option<Rc<RecordV>> {
        let (_, _, ty) = self.ctx.lookup(name_seg(CODOMAIN_BINDER))?;
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

    fn syn_hole(&mut self) -> (BaseTmS, BaseTmV, BaseTyV) {
        let tm_m = self.fresh_meta();
        let ty_m = self.fresh_meta();
        (BaseTmS::meta(tm_m), BaseTmV::meta(tm_m), BaseTyV::meta(ty_m))
    }

    fn syn_error(&mut self, msg: impl Into<String>) -> (BaseTmS, BaseTmV, BaseTyV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.syn_hole()
    }

    fn chk_hole(&mut self) -> (BaseTmS, BaseTmV) {
        let tm_m = self.fresh_meta();
        (BaseTmS::meta(tm_m), BaseTmV::meta(tm_m))
    }

    fn chk_error(&mut self, msg: impl Into<String>) -> (BaseTmS, BaseTmV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.chk_hole()
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
        self.ctx.push_scope(name, label, ty);
        v
    }

    /// Report a text-surface error and return a synthesis hole. Errors
    /// from the shared fiber machinery go through
    /// [`FiberElab::report_fiber`] instead.
    fn fiber_syn_error_msg(&mut self, msg: impl Into<String>) -> (FiberTmS, FiberTmV, FiberTyV) {
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg.into());
        self.fiber_syn_hole()
    }

    /// Synthesize a fiber term and its fiber type. A fiber term is a
    /// generator/import variable, a projection out of a sub-instance
    /// (`we.e`), or a codomain-morphism application (`src(we.e)`).
    fn fiber_syn(&mut self, n: &FNtn) -> (FiberTmS, FiberTmV, FiberTyV) {
        let mut elab = self.enter(n.loc());
        match n.ast0() {
            Var(name) => match elab.lookup_fiber_tm(name_seg(*name)) {
                Some(r) => r,
                None => elab.fiber_syn_error(FiberError::UnknownElement(name.to_string())),
            },
            // Projection of a generator out of a sub-instance import: `we.e`.
            App1(recv_n, L(_, Field(f))) => {
                let (recv_s, recv_v, recv_ty) = elab.fiber_syn(recv_n);
                elab.fiber_proj(recv_s, recv_v, &recv_ty, name_seg(*f))
            }
            // A theory object-operation on a fiber element, e.g.
            // `@tensor [a, b]`. The resulting element lies over the
            // operation applied to the argument's base object.
            App1(L(_, Prim(op)), arg_n) => {
                let op_name = name_seg(*op);
                if !elab.check_ob_op(op_name) {
                    return elab.fiber_syn_hole();
                }
                let (arg_s, arg_v, arg_ty) = elab.fiber_syn(arg_n);
                elab.fiber_ob_app(op_name, arg_s, arg_v, &arg_ty)
            }
            // Codomain-morphism application `f(arg)`. The morphism `f` may
            // be a nested path into the codomain (e.g. `Add.op`), so its
            // head is a projection chain, not just a bare variable.
            App1(head_n, arg_n) => {
                let Some(path) = morphism_path(head_n) else {
                    return elab.fiber_syn_error_msg(
                        "expected a codomain morphism (a name or path like `Add.op`) applied \
                         to a fiber element",
                    );
                };
                // A display label for the argument, used only in errors.
                let label = match arg_n.ast0() {
                    Var(x) => x.to_string(),
                    App1(_, L(_, Field(fld))) => fld.to_string(),
                    _ => "argument".to_string(),
                };
                let (arg_s, arg_v, arg_ty) = elab.fiber_syn(arg_n);
                elab.apply_codomain_morphism(&path, arg_s, arg_v, arg_ty, &label)
            }
            // A fiber list literal `[a, b, ...]` (the argument of a
            // multi-ary morphism); its object is the list of the elements'
            // objects.
            Tuple(elems) => {
                let mut ss = Vec::with_capacity(elems.len());
                let mut vs = Vec::with_capacity(elems.len());
                let mut objs = Vec::with_capacity(elems.len());
                for e in elems.iter() {
                    let (s, v, ty) = elab.fiber_syn(e);
                    let FiberTyV_::Over(o) = &*ty else {
                        return elab.fiber_syn_error(FiberError::ListElementNotOver);
                    };
                    objs.push(o.clone());
                    ss.push(s);
                    vs.push(v);
                }
                (FiberTmS::list(ss), FiberTmV::list(vs), FiberTyV::over(BaseTmV::list(objs)))
            }
            _ => elab.fiber_syn_error_msg(
                "expected a fiber element: a generator, a projection `we.e`, a fiber list \
                 `[..]`, an object operation `@op [..]`, or a morphism application `f[..]`",
            ),
        }
    }

    /// Check a fiber term against an expected fiber type. Fiber terms are
    /// all synthesizing, so this synthesizes and checks convertibility.
    fn fiber_chk(&mut self, expected: &FiberTyV, n: &FNtn) -> (FiberTmS, FiberTmV) {
        let syn = self.fiber_syn(n);
        self.check_fiber(syn, expected)
    }

    /// Elaborate a fiber-type annotation. Used for sub-instance imports
    /// (`we : Edge`, where `Edge` names a top-level instance) and anonymous
    /// equations (`name : (a == b)`).
    fn fiber_ty(&mut self, n: &FNtn) -> Option<(FiberTyS, FiberTyV)> {
        match n.ast0() {
            Var(name) => {
                let topvar = name_seg(*name);
                let (imported_codomain, val) = match self.toplevel.declarations.get(&topvar) {
                    Some(TopDecl::Instance(i)) => (i.codomain.clone(), i.val.clone()),
                    _ => {
                        return self.error(format!(
                            "{name} must reference a top-level instance declaration"
                        ));
                    }
                };
                // The imported instance must be an instance of the *same*
                // model as the enclosing one — otherwise its `Over` paths
                // refer to objects foreign to this codomain, producing a
                // malformed instance.
                if let Some(cod) = self.instance_codomain() {
                    let enclosing = BaseTyV::record((*cod).clone());
                    if !self.codomains_match(&enclosing, &imported_codomain) {
                        self.report_fiber(FiberError::ImportCodomainMismatch(name.to_string()));
                        return None;
                    }
                }
                // The syntax keeps the instance's name (for display); the
                // value is the referenced instance's resolved record, just
                // as a base top-var evaluates to its model. See
                // [`FiberTyS_::TopVar`].
                Some((FiberTyS::topvar(topvar), val))
            }
            App2(L(_, Keyword("==")), a_n, b_n) => {
                let (a_s, a_v, a_ty) = self.fiber_syn(a_n);
                let (b_s, b_v, b_ty) = self.fiber_syn(b_n);
                if let Err(e) = self.evaluator().convertible_fiber_ty(&a_ty, &b_ty) {
                    self.report_fiber(FiberError::InconvertibleEquationSides(
                        e.pretty().to_string(),
                    ));
                    return None;
                }
                let FiberTyV_::Over(obj) = &*a_ty else {
                    self.report_fiber(FiberError::EquationNotOver);
                    return None;
                };
                Some(self.fiber_id_field(&a_ty, obj, a_s, a_v, b_s, b_v))
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

    /// The value of the codomain `self` binding — the eta-expanded model
    /// record. Codomain object values (`self.V`, morphism dom/cod) are
    /// obtained by projecting / evaluating field types against it, so that
    /// every codomain object is rooted at the same `self` neutral and thus
    /// compares equal under [`Evaluator::equal_tm`].
    fn codomain_self_value(&self) -> Option<BaseTmV> {
        let (i, _, _) = self.ctx.lookup(name_seg(CODOMAIN_BINDER))?;
        self.ctx.env.get(*i).cloned()
    }

    /// The codomain object `self.<field>` (a base object value), for a
    /// generator declared over the object-typed codomain field `field`.
    fn codomain_object(&self, field: FieldName, label: LabelSegment) -> Option<BaseTmV> {
        Some(self.evaluator().proj(&self.codomain_self_value()?, field, label))
    }

    /// Apply a codomain morphism `f` to an already-elaborated fiber
    /// argument. The argument's `Over` object must equal the morphism's
    /// domain object (compared as base objects, so modal domains — lists,
    /// tensors — need no special handling); the result lies over the
    /// morphism's codomain object.
    fn apply_codomain_morphism(
        &mut self,
        path: &[(FieldName, LabelSegment)],
        arg_s: FiberTmS,
        arg_v: FiberTmV,
        arg_ty: FiberTyV,
        arg_label_str: &str,
    ) -> (FiberTmS, FiberTmV, FiberTyV) {
        let Some(codomain) = self.instance_codomain() else {
            return self.fiber_syn_error_msg(
                "applied codomain morphism is only allowed inside an instance body",
            );
        };
        let FiberTyV_::Over(arg_obj) = &*arg_ty else {
            return self
                .fiber_syn_error(FiberError::ArgNotElement(Some(arg_label_str.to_string())));
        };
        let arg_obj = arg_obj.clone();
        let Some(self_val) = self.codomain_self_value() else {
            return self.fiber_syn_error_msg(
                "applied codomain morphism is only allowed inside an instance body",
            );
        };
        // Resolve the morphism's type by walking its (possibly nested)
        // path into the codomain model, e.g. `Add.op`.
        let record_ty = BaseTyV::record((*codomain).clone());
        let mor_ty = match self.evaluator().path_ty(&record_ty, &self_val, path) {
            Ok(ty) => ty,
            Err(e) => {
                return self.fiber_syn_error_msg(format!(
                    "no such codomain morphism {}: {e}",
                    path_str(path)
                ));
            }
        };
        self.fiber_mor_app(path, &mor_ty, arg_s, arg_v, &arg_obj)
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
        let binder = name_seg(CODOMAIN_BINDER);
        self.intro(binder, label_seg(CODOMAIN_BINDER), Some(BaseTyV::record(codomain.clone())));
        let result = self.instance_body_inner(n);
        self.reset_to(c);
        result
    }

    /// Re-establish the scope of an already-elaborated instance so a fresh
    /// term can be elaborated against it (see the `norm [inst] <term>`
    /// command): bind the codomain model as `self` — so codomain-morphism
    /// syntax like `t(..)` resolves — and introduce each generator and
    /// sub-instance import into the fiber scope by its original name.
    fn enter_instance(&mut self, inst: &Instance) -> Option<()> {
        self.intro(
            name_seg(CODOMAIN_BINDER),
            label_seg(CODOMAIN_BINDER),
            Some(inst.codomain.clone()),
        );
        let FiberTyV_::Record(fields) = &*inst.val else {
            return self.error("instance value is not a fiber record");
        };
        for (name, (label, field_ty)) in fields.iter() {
            match &**field_ty {
                // Generators (`Over`) and sub-instance imports (`Record`)
                // become fiber-scope bindings; projections into an import
                // resolve against the record type. Equations (`Id`) are not
                // in scope as terms.
                FiberTyV_::Over(_) | FiberTyV_::Record(_) => {
                    self.intro_fiber(*name, *label, field_ty.clone());
                }
                FiberTyV_::Id(_, _, _) => {}
            }
        }
        Some(())
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
                    if !codomain.fields.has(f_seg) {
                        elab.error::<()>(format!("no such codomain field {field_name}"));
                        failed = true;
                        continue;
                    }
                    // Each `key := target` entry is the equation
                    // `field(key) == target`: apply the codomain morphism
                    // to the key (which also checks the key's object against
                    // the morphism's domain and yields the codomain object),
                    // then equate the result to the target.
                    let mut entry_failed = false;
                    for entry_n in entries.iter() {
                        elab.loc = Some(entry_n.loc());
                        let App2(L(_, Keyword(":=")), key_n, target_n) = entry_n.ast0() else {
                            unreachable!("guard ensured all entries are `:=` clauses");
                        };
                        let (key_s, key_v, key_ty) = elab.fiber_syn(key_n);
                        let label = format!("{field_name} key");
                        let mor_path = vec![(name_seg(*field_name), label_seg(*field_name))];
                        let (lhs_s, lhs_v, lhs_ty) =
                            elab.apply_codomain_morphism(&mor_path, key_s, key_v, key_ty, &label);
                        let FiberTyV_::Over(cod_obj) = &*lhs_ty else {
                            entry_failed = true;
                            break;
                        };
                        let cod_obj = cod_obj.clone();
                        let (rhs_s, rhs_v) = elab.fiber_chk(&lhs_ty, target_n);
                        let (id_s, id_v) =
                            elab.fiber_id_field(&lhs_ty, &cod_obj, lhs_s, lhs_v, rhs_s, rhs_v);
                        let (eqn, eql) = next_eq_field(&mut eq_count);
                        fields_s.insert(eqn, eql, id_s);
                        fields_v.insert(eqn, eql, id_v);
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
                    // Generators lie over the codomain object `self.<field>`.
                    let Some(gen_obj_v) = elab.codomain_object(f_seg, f_label) else {
                        elab.error::<()>(
                            "set-literal field assignment is only allowed inside an \
                             instance body",
                        );
                        failed = true;
                        continue;
                    };
                    let gen_obj_s = elab.evaluator().quote_tm(&gen_obj_v);
                    for name_n in name_ns.iter() {
                        let Var(gen_name) = name_n.ast0() else {
                            elab.loc = Some(name_n.loc());
                            elab.error::<()>("set-literal entries must be bare names");
                            failed = true;
                            break;
                        };
                        let gen_seg = name_seg(*gen_name);
                        let gen_label = label_seg(*gen_name);
                        elab.intro_fiber(gen_seg, gen_label, FiberTyV::over(gen_obj_v.clone()));
                        fields_s.insert(gen_seg, gen_label, FiberTyS::over(gen_obj_s.clone()));
                        fields_v.insert(gen_seg, gen_label, FiberTyV::over(gen_obj_v.clone()));
                    }
                }
                // `mor(arg) := target` — a single equation witness.
                App2(L(_, Keyword(":=")), lhs_n, rhs_n) => {
                    let (lhs_s, lhs_v, lhs_ty) = elab.fiber_syn(lhs_n);
                    let FiberTyV_::Over(obj) = &*lhs_ty else {
                        elab.loc = Some(lhs_n.loc());
                        elab.report_fiber(FiberError::MappingLhsNotOver);
                        failed = true;
                        continue;
                    };
                    let obj = obj.clone();
                    let (rhs_s, rhs_v) = elab.fiber_chk(&lhs_ty, rhs_n);
                    let (id_s, id_v) =
                        elab.fiber_id_field(&lhs_ty, &obj, lhs_s, lhs_v, rhs_s, rhs_v);
                    let (eqn, eql) = next_eq_field(&mut eq_count);
                    fields_s.insert(eqn, eql, id_s);
                    fields_v.insert(eqn, eql, id_v);
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
                    elab.ctx.env = elab
                        .ctx
                        .env
                        .snoc(BaseTmV::neu(TmN::proj(self_var.clone(), name, label), ty_v));
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

    fn lookup_tm(&mut self, name: Ustr) -> (BaseTmS, BaseTmV, BaseTyV) {
        let label = label_seg(name);
        let name = name_seg(name);
        if let Some((i, _, ty)) = self.ctx.lookup(name) {
            (
                BaseTmS::var(i, name, label),
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
                    (
                        BaseTmS::topapp(name, vec![]),
                        eval.eval_tm(&def.body),
                        eval.eval_ty(&def.ret_ty),
                    )
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
    fn syn(&mut self, n: &FNtn) -> (BaseTmS, BaseTmV, BaseTyV) {
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
                    BaseTmS::proj(tm_s, f, label),
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
                    BaseTmS::id(ob_s),
                    BaseTmV::id(ob_v.clone()),
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
                (BaseTmS::tab(mor_s), BaseTmV::tab(mor_v.clone()), BaseTyV::object(ob_type))
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
                (BaseTmS::ob_app(name, arg_s), BaseTmV::app(name, arg_v), BaseTyV::object(cod))
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
                    BaseTmS::compose(f_s, g_s),
                    BaseTmV::compose(f_v, g_v),
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
                (BaseTmS::topapp(tv, arg_stxs), eval.eval_tm(&d.body), eval.eval_ty(&d.ret_ty))
            }
            Tag("tt") => {
                // `tt` is the unique element of `Unit`, i.e. the empty record `[]`.
                let (_, ty_v) = elab.empty_record_ty();
                (BaseTmS::cons(Row::empty()), BaseTmV::cons(Row::empty()), ty_v)
            }
            Tuple(_) => elab.syn_error("must check against a type in order to construct a record"),
            Prim("hole") => elab.syn_error("explicit hole"),
            _ => elab.syn_error("unexpected notation for term"),
        }
    }

    /// Elaborates a term from notation, checking against an expected type, and returning syntax and value.
    fn chk(&mut self, ty: &BaseTyV, n: &FNtn) -> (BaseTmS, BaseTmV) {
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
                    let v = BaseTmV::cons(field_vals.clone().into());
                    let field_ty_v =
                        elab.evaluator().with_env(r.env.snoc(v.clone())).eval_ty(field_ty_s);
                    let (tm_s, tm_v) = elab.chk(&field_ty_v, tm_n);
                    field_stxs.insert(*name, (*label, tm_s));
                    field_vals.insert(*name, (*label, tm_v));
                }
                (BaseTmS::cons(field_stxs.into()), BaseTmV::cons(field_vals.into()))
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
                (BaseTmS::list(elem_stxs), BaseTmV::list(elem_vals))
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

/// Extract the path to a codomain morphism from the head of an
/// application: a bare variable `f` gives `[f]`, and a projection chain
/// `Add.op` gives `[Add, op]`. Returns `None` for any other shape.
impl<'a> FiberElab for Elaborator<'a> {
    fn ctx(&self) -> &Context {
        &self.ctx
    }

    fn ctx_mut(&mut self) -> &mut Context {
        &mut self.ctx
    }

    fn elab_theory(&self) -> &Theory {
        &self.theory
    }

    fn evaluator(&self) -> Evaluator<'_> {
        Elaborator::evaluator(self)
    }

    fn fresh_meta(&mut self) -> MetaVar {
        Elaborator::fresh_meta(self)
    }

    /// Formats fiber errors into the exact messages this elaborator has
    /// always reported; they appear verbatim in committed snapshots, so the
    /// strings must not drift.
    fn report_fiber(&mut self, err: FiberError) {
        let msg = match err {
            FiberError::UnknownElement(name) => format!("no such fiber element {name}"),
            FiberError::ProjNonRecord => {
                "can only project a generator out of a sub-instance".to_string()
            }
            FiberError::UnknownProj(field) => {
                format!("no such generator {field} in sub-instance")
            }
            FiberError::UnknownObOp(op, th) => format!("operation @{op} not in theory {th}"),
            FiberError::ObOpOnNonElement(op) => format!("@{op} applied to a non-fiber-element"),
            FiberError::ListElementNotOver => {
                "fiber list elements must be elements over an object".to_string()
            }
            // Only notebook cells can contain unfilled slots.
            FiberError::MissingTerm => "missing term".to_string(),
            FiberError::ArgNotElement(label) => match label {
                Some(label) => format!("argument {label} is not an element over an object"),
                None => "argument is not an element over an object".to_string(),
            },
            FiberError::NotAMorphism(path) => {
                format!("codomain field {path} is not a morphism")
            }
            FiberError::ArgMismatch { path, got, expected, detail } => {
                format!("argument to {path} lies over {got}, but it expects {expected}:\n{detail}")
            }
            FiberError::WrongFiberType(detail) => {
                format!("fiber element has the wrong type:\n{detail}")
            }
            FiberError::MappingLhsNotOver => {
                "mapping-entry clause `mor(arg) := target` requires the LHS \
                 to be an element over an object (a fiber element); morphism \
                 equations constrain the model, not an instance"
                    .to_string()
            }
            FiberError::EquationNotOver => {
                "instance equations must be between elements over an object \
                 (fiber elements); morphism equations constrain the model, not \
                 an instance"
                    .to_string()
            }
            FiberError::InconvertibleEquationSides(detail) => {
                format!("equation sides have inconvertible fiber types:\n{detail}")
            }
            FiberError::ImportCodomainMismatch(name) => {
                format!(
                    "cannot import {name}: it is an instance of a different model than \
                     the enclosing instance"
                )
            }
        };
        self.reporter.error_option_loc(self.loc, ELAB_ERROR, msg);
    }
}

fn morphism_path(n: &FNtn) -> Option<Vec<(FieldName, LabelSegment)>> {
    match n.ast0() {
        Var(f) => Some(vec![(name_seg(*f), label_seg(*f))]),
        App1(recv, L(_, Field(g))) => {
            let mut p = morphism_path(recv)?;
            p.push((name_seg(*g), label_seg(*g)));
            Some(p)
        }
        _ => None,
    }
}

/// Render a morphism/object path as dotted labels (e.g. `Add.op`), for
/// error messages.
/// The synthetic field name/label `_eqN` for the next auto-named equation
/// field of an instance record, advancing the counter.
fn next_eq_field(eq_count: &mut usize) -> (FieldName, LabelSegment) {
    let key = format!("_eq{}", *eq_count);
    *eq_count += 1;
    (name_seg(key.as_str()), label_seg(key.as_str()))
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
