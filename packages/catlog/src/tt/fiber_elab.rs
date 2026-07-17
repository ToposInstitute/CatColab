//! The fiber-elaboration core shared by the text and notebook elaborators.
//!
//! Both elaborators build instances the same way, by introducing fiber variables for
//! generators and sub-instance imports, fiber terms for elements, and `Id`
//! fields for equations. But they report errors through different channels: the
//! [text elaborator](super::text_elab) emits located messages through a
//! `Reporter`, while the [notebook elaborator](super::notebook_elab) collects
//! typed [`InvalidDblModel`](crate::dbl::model::InvalidDblModel) values
//! attributed to cell UUIDs. [`FiberElab`] carries the shared machinery as
//! provided methods, and [`FiberError`] is the neutral currency that each
//! implementor maps into its own channel via [`FiberElab::report_fiber`].
//!
//! Everything here is `pub(in crate::tt)`. The module boundary enforced today
//! is the crate boundary of a prospective standalone `tt` crate.

use super::{context::*, eval::*, prelude::*, stx::*, theory::*, val::*};

/// Reserved name under which an instance's codomain model is bound as a
/// context variable.
///
/// It contains a space, so the text elaborator's lexer — which restricts
/// identifiers to alphanumerics and `_` — can never produce it, and notebook
/// cell names are UUIDs; hence a user-declared generator, sub-instance, or
/// field can never shadow the codomain binding. Both elaborators bind the
/// codomain first in an empty context, so fiber values from either pipeline
/// root at the same de Bruijn level and their neutrals compare equal.
pub(in crate::tt) const CODOMAIN_BINDER: &str = "instance self";

/// Renders a codomain path for display in error messages.
pub(in crate::tt) fn path_str(path: &[(FieldName, LabelSegment)]) -> String {
    path.iter().map(|(_, label)| label.to_string()).collect::<Vec<_>>().join(".")
}

/// An error in fiber elaboration.
///
/// Unlike the validation enums in [`crate::dbl`] (`InvalidDblModel` and
/// friends), which are QualifiedName-keyed results serialized across the wasm
/// boundary, this enum is elaborator-internal plumbing: it exists only to be
/// mapped into each elaborator's reporting channel by
/// [`FiberElab::report_fiber`] and never escapes `tt` — hence no serde
/// derives. Payloads are pre-formatted strings because the text channel's
/// messages appear verbatim in committed snapshots..
#[derive(Clone, Debug, PartialEq, Eq)]
pub(in crate::tt) enum FiberError {
    /// Reference to an unknown fiber element (generator or import).
    UnknownElement(String),
    /// Projection out of a fiber element that is not a sub-instance.
    ProjNonRecord,
    /// Projection of a generator absent from the sub-instance.
    UnknownProj(String),
    /// Object operation not present in the theory: (operation, theory name).
    UnknownObOp(String, String),
    /// Object operation applied to a non-element.
    ObOpOnNonElement(String),
    /// Fiber list element that is not an element over an object.
    ListElementNotOver,
    /// A hole in a notebook term (an unfilled editor slot).
    MissingTerm,
    /// Morphism-application argument that is not an element, with its
    /// display name when the surface syntax provides one.
    ArgNotElement(Option<String>),
    /// Codomain field used as a morphism that is not one, by path.
    NotAMorphism(String),
    /// Morphism applied to an argument over the wrong object.
    ArgMismatch {
        /// Display path of the morphism.
        path: String,
        /// The object the argument lies over (quoted).
        got: String,
        /// The morphism's domain object (quoted).
        expected: String,
        /// Pretty-printed equality failure.
        detail: String,
    },
    /// Fiber term whose type is inconvertible with the expected type.
    WrongFiberType(String),
    /// LHS of a `mor(arg) := target` clause that is not an element.
    MappingLhsNotOver,
    /// Equation between things that are not fiber elements.
    EquationNotOver,
    /// Equation sides with inconvertible fiber types.
    InconvertibleEquationSides(String),
    /// Import of an instance of a different model, by display name.
    ImportCodomainMismatch(String),
}

/// The fiber-elaboration core.
///
/// Implementors supply context and theory access, meta generation, and an
/// error channel; the provided methods are the machinery both elaborators
/// share. Surface-syntax dispatch (f-notation, notebook instance terms,
/// diagram object references) stays with the implementors, whose arms
/// delegate here.
pub(in crate::tt) trait FiberElab {
    /// The elaboration context.
    fn ctx(&self) -> &Context;

    /// The elaboration context, mutably.
    fn ctx_mut(&mut self) -> &mut Context;

    /// The theory elaboration happens in.
    fn elab_theory(&self) -> &Theory;

    /// An evaluator for the current context.
    fn evaluator(&self) -> Evaluator<'_>;

    /// A fresh metavariable.
    fn fresh_meta(&mut self) -> MetaVar;

    /// Report a fiber-elaboration error through this elaborator's channel.
    fn report_fiber(&mut self, err: FiberError);

    /// The definition of the ambient theory.
    fn theory_def(&self) -> &TheoryDef {
        &self.elab_theory().definition
    }

    /// Introduce a fiber variable (a generator or sub-instance import) into
    /// the fiber scope, returning its neutral value.
    fn intro_fiber(&mut self, name: VarName, label: LabelSegment, ty: FiberTyV) -> FiberTmV {
        let ctx = self.ctx_mut();
        let v = FiberTmV::var(ctx.fiber_scope.len().into(), name, label);
        ctx.fiber_env = ctx.fiber_env.snoc(v.clone());
        ctx.push_fiber(name, label, ty);
        v
    }

    /// Look up a fiber variable by name, returning its syntax, value, and
    /// fiber type.
    fn lookup_fiber_tm(&self, name: VarName) -> Option<(FiberTmS, FiberTmV, FiberTyV)> {
        let (i, label, ty) = self.ctx().lookup_fiber(name)?;
        Some((FiberTmS::var(i, name, label), self.ctx().fiber_env.get(*i).unwrap().clone(), ty))
    }

    /// A fiber term standing in for a failed synthesis.
    fn fiber_syn_hole(&mut self) -> (FiberTmS, FiberTmV, FiberTyV) {
        let tm_m = self.fresh_meta();
        let obj_m = self.fresh_meta();
        (FiberTmS::meta(tm_m), FiberTmV::meta(tm_m), FiberTyV::over(BaseTmV::meta(obj_m)))
    }

    /// Report an error and return a synthesis hole.
    fn fiber_syn_error(&mut self, err: FiberError) -> (FiberTmS, FiberTmV, FiberTyV) {
        self.report_fiber(err);
        self.fiber_syn_hole()
    }

    /// Report an error and return a checking hole.
    fn fiber_chk_error(&mut self, err: FiberError) -> (FiberTmS, FiberTmV) {
        self.report_fiber(err);
        let tm_m = self.fresh_meta();
        (FiberTmS::meta(tm_m), FiberTmV::meta(tm_m))
    }

    /// Whether two codomain models agree closely enough to import an
    /// instance of one into an instance of the other: identical top-level
    /// field names (in order) and convertible field types.
    ///
    /// This is deliberately stricter than [`Evaluator::convertible_ty`],
    /// which for records is positional and ignores field names and arity
    /// — so it would wrongly accept e.g. `[V : Entity, E : Entity]` as
    /// convertible with `[W : Entity, F : Entity]`.
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

    /// Project a generator out of a sub-instance import, e.g. `we.e`. The
    /// field's label comes from the import's record row.
    fn fiber_proj(
        &mut self,
        recv_s: FiberTmS,
        recv_v: FiberTmV,
        recv_ty: &FiberTyV,
        field: FieldName,
    ) -> (FiberTmS, FiberTmV, FiberTyV) {
        let FiberTyV_::Record(r) = &**recv_ty else {
            return self.fiber_syn_error(FiberError::ProjNonRecord);
        };
        let Some((label, field_ty)) = r.get_with_label(field) else {
            return self.fiber_syn_error(FiberError::UnknownProj(field.to_string()));
        };
        let (label, field_ty) = (*label, field_ty.clone());
        (
            FiberTmS::proj(recv_s, field, label),
            FiberTmV::proj(recv_v, field, label),
            field_ty,
        )
    }

    /// Whether the theory has the given object operation, reporting an error
    /// if not. Checked by dispatchers *before* synthesizing the argument, to
    /// preserve error order.
    fn check_ob_op(&mut self, op: VarName) -> bool {
        if self.theory_def().basic_ob_op([op].into()).is_none() {
            let th = self.elab_theory().name.to_string();
            self.report_fiber(FiberError::UnknownObOp(op.to_string(), th));
            return false;
        }
        true
    }

    /// Apply a theory object-operation to an already-synthesized fiber
    /// element, e.g. `@tensor [a, b]`. The resulting element lies over the
    /// operation applied to the argument's base object.
    fn fiber_ob_app(
        &mut self,
        op: VarName,
        arg_s: FiberTmS,
        arg_v: FiberTmV,
        arg_ty: &FiberTyV,
    ) -> (FiberTmS, FiberTmV, FiberTyV) {
        let FiberTyV_::Over(arg_obj) = &**arg_ty else {
            return self.fiber_syn_error(FiberError::ObOpOnNonElement(op.to_string()));
        };
        let obj = BaseTmV::app(op, arg_obj.clone());
        (FiberTmS::ob_app(op, arg_s), FiberTmV::ob_app(op, arg_v), FiberTyV::over(obj))
    }

    /// Apply an already-resolved codomain morphism to a fiber argument
    /// already known to lie over `arg_obj`. The argument's object must equal
    /// the morphism's domain object (compared as base objects, so modal
    /// domains — lists, tensors — need no special handling); the result lies
    /// over the morphism's codomain object. Resolution of the morphism (and
    /// the check that the argument is an element at all) stays with the
    /// caller, which knows its surface syntax and error order.
    fn fiber_mor_app(
        &mut self,
        path: &[(FieldName, LabelSegment)],
        mor_ty: &BaseTyV,
        arg_s: FiberTmS,
        arg_v: FiberTmV,
        arg_obj: &BaseTmV,
    ) -> (FiberTmS, FiberTmV, FiberTyV) {
        let BaseTyV_::Morphism(_, dom_obj, cod_obj) = &**mor_ty else {
            return self.fiber_syn_error(FiberError::NotAMorphism(path_str(path)));
        };
        if let Err(e) = self.evaluator().equal_tm(arg_obj, dom_obj) {
            let ev = self.evaluator();
            let err = FiberError::ArgMismatch {
                path: path_str(path),
                got: ev.quote_tm(arg_obj).to_string(),
                expected: ev.quote_tm(dom_obj).to_string(),
                detail: e.pretty().to_string(),
            };
            return self.fiber_syn_error(err);
        }
        let cod_s = self.evaluator().quote_tm(cod_obj);
        (
            FiberTmS::over_app(path.to_vec(), cod_s, arg_s),
            FiberTmV::over_app(path.to_vec(), cod_obj.clone(), arg_v),
            FiberTyV::over(cod_obj.clone()),
        )
    }

    /// Check a synthesized fiber term against an expected fiber type.
    fn check_fiber(
        &mut self,
        syn: (FiberTmS, FiberTmV, FiberTyV),
        expected: &FiberTyV,
    ) -> (FiberTmS, FiberTmV) {
        let (s, v, ty) = syn;
        if let Err(e) = self.evaluator().convertible_fiber_ty(&ty, expected) {
            return self.fiber_chk_error(FiberError::WrongFiberType(e.pretty().to_string()));
        }
        (s, v)
    }

    /// Assemble an equation ([`Id`](FiberTyS_::Id)) field from an
    /// already-checked pair of sides, the LHS lying over `over_obj`.
    fn fiber_id_field(
        &self,
        lhs_ty: &FiberTyV,
        over_obj: &BaseTmV,
        lhs_s: FiberTmS,
        lhs_v: FiberTmV,
        rhs_s: FiberTmS,
        rhs_v: FiberTmV,
    ) -> (FiberTyS, FiberTyV) {
        let over_s = FiberTyS::over(self.evaluator().quote_tm(over_obj));
        (FiberTyS::id(over_s, lhs_s, rhs_s), FiberTyV::id(lhs_ty.clone(), lhs_v, rhs_v))
    }
}
