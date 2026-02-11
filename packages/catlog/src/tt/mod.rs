//! DoubleTT: type theory for models of a double category.
//!
//! This is developer documentation explaining how DoubleTT works "under the
//! hood". It expects that you already know the basics of how to write models of
//! double theories and morphisms between them using DoubleTT. A mathematical
//! presentation of the type theory implemented here is available in the [math
//! docs](https://next.catcolab.org/math/tt-0001.xml).
//!
//! To a first approximation, DoubleTT is a standard dependent type theory
//! implemented using normalization by evaluation (following [Coquand's
//! algorithm](https://doi.org/10.1016/0167-6423(95)00021-6)), so we start by
//! explaining what that looks like.
//!
//! # Basics of normalization by evaluation (NbE)
//!
//! There are four data structures that form the core of this implementation, which
//! may be arranged in a 2x2 grid:
//!
//! |      | Syntax | Value |
//! |------|--------|-------|
//! | Term | [TmS]  | [TmV] |
//! | Type | [TyS]  | [TyV] |
//!
//! Evaluation is the process of going from syntax to values. Evaluation is used to
//! *normalize types*. We need to normalize types because there are many different
//! syntaxes which may produces the same type. For instance, `b`, and `x.a` where
//! `x : [ a : @sing b ]` are both the same type. Because types may depend on terms,
//! we must also normalize terms. (Later we will see that we don't have to normalize
//! *all* terms, but in a vanilla dependent type theory implementation, one does
//! have to normalize all terms, and as we are reviewing the basics here, we will
//! stick to that assumption).
//!
//! An evaluator for the untyped lambda calculus would look like the following code,
//! which is in a "rust with a gc" syntax.
//!
//! ```ignore
//! type BwdIdx = usize;
//!
//! enum TmS {
//!     Var(BwdIdx),
//!     App(TmS, TmS),
//!     Lam(TmS)
//! }
//!
//! type Env = Bwd<Closure>;
//!
//! struct Closure {
//!     env: Env,
//!     body: TmS
//! }
//!
//! fn eval(env: Env, tm_s: TmS) -> Closure {
//!     match tm_s {
//!         TmS::Var(i) => env.lookup(i),
//!         TmS::App(f, x) => {
//!             let fv = eval(env, f);
//!             let xv = eval(env, x);
//!             eval(fv.env.snoc(xv), fv.body)
//!         }
//!         TmS::Lam(body) => Closure { env, body }
//!     }
//! }
//! ```
//!
//! This is a "closed" evaluator for lambda calculus, which means that a value is
//! *always* a closure. What we need for type theory is an "open" evaluator,
//! which means that a value is either a closure, or a variable. This permits us
//! to normalize *past a binding*. For instance, we can normalize `λ x. (λ x. x) x`
//! to `λ x. x`. This looks like the following:
//!
//! ```ignore
//! type FwdIdx = usize;
//!
//! enum TmV {
//!     // f a₁ ... aₙ
//!     Neu(FwdIdx, Bwd<TmV>),
//!     Clo(Closure)
//! }
//!
//! impl TmV {
//!     fn app(self, arg: TmV) -> TmV {
//!         match self {
//!             TmV::Neu(head, args) => TmV::Neu(head, args.snoc(arg)),
//!             TmV::Clo(clo) => eval(clo.env.snoc(arg), clo.body)
//!         }
//!     }
//! }
//!
//! type Env = Bwd<TmV>;
//!
//! fn eval(env: Env, tm_s: TmS) -> Closure {
//!     match tm_s {
//!         TmS::Var(i) => env.lookup(i),
//!         TmS::App(f, x) => {
//!             let fv = eval(env, f);
//!             let xv = eval(env, x);
//!             fv.app(xv)
//!         }
//!         TmS::Lam(body) => TmV::Clo(Closure { env, body })
//!     }
//! }
//!
//!     fn quote(scope_len: usize, tm_v: TmV) -> TmS {
//!         match tm_v {
//!             TmV::Neu(f, xs) =>
//!                 xs.iter.fold(TmS::Var(scope_len - f - 1), |f, x| TmS::App(f, x)),
//!             TmV::Clo(clo) => {
//!                 let x_v = TmV::Neu(scope_len, Bwd::Nil);
//!                 let body_v = eval(clo.env.snoc(x_v), clo.body);
//!             TmS::Lam(quote(scope_len + 1, body_v));
//!         }
//!     }
//! }
//! ```
//!
//! The normalization procedure is achieved by evaluating then quoting.
//!
//! In a way, evaluation is kind of like substitution, in that it replaces variables
//! with values. However, the key difference is that evaluation creates closures
//! that capture their environment, while substitution does not.
//!
//! # NbE in DoubleTT
//!
//! The implementation of NbE for DoubleTT is simplified compared to a generic
//! dependent type theory because we need only normalize types for objects---and
//! type dependency appears only for morphism types (which depend on a pair of
//! objects). Therefore, we don’t need to worry about equality checking
//! with respect to any morphism equalities which we might want to impose.
//!
//! # Specialization
//!
//! Another important feature of DoubleTT is *specialization*. We can see
//! specialization at play in the following example. Let `Graph` and `Graph2` be
//! the following double models.
//!
//! ```text
//! type Graph := [
//!     E : Entity,
//!     V : Entity,
//!     src : (Id Entity)[E, V],
//!     tgt : (Id Entity)[E, V],
//! ]
//! /# declared: Graph
//!
//! type Graph2 := [
//!     V : Entity,
//!     g1 : Graph & [ .V := V ],
//!     g2 : Graph & [ .V := V ]
//! ]
//! /# declared: Graph2
//! ```
//!
//! Then we can synthesize the type of `g.g1.V` in the context of a variable `g: Graph2`
//! via:
//!
//! ```text
//! syn [g: Graph2] g.g1.V
//! /# result: g.g1.V : @sing g.V
//! ```
//!
//! We can also normalize `g.g1.V` in the context of a variable `g: Graph2`:
//!
//! ```text
//! norm [g: Graph2] g.g1.V
//! /# result: g.V
//! ```
//!
//! This shows how the specialization `g1 : Graph & [ .V := V ]` influences the type
//! and normalization of the `.g1.V` field of a model of `Graph2`.
//!
//! Specialization is a way of creating *subtypes* of a record type by setting the
//! type of a field to be a subtype of its original type. So in order to understand
//! specialization, one must first understand subtyping. In DoubleTT, there are
//! two ways to form subtypes. We write `A <: B` for "`A` is a subtype of `B`".
//!
//! 1. If `a : A`, then `@sing a <: A`.
//! 2. If `A` is a record type with a field `.x`, and `B` is a subtype of the type of
//!    `a.x` for a generic element `a : A`, then `A & [ .x : B ] <: A`. The notation `A
//!    & [ .x := y ]` is just syntactic sugar for `A & [ .x : @sing y ]`.
//!
//! Crucially, the type of `a.x` may depend on the values of other fields of `a`, so
//! it is important that the subtyping check is performed in the context of a *generic*
//! element of `A`. In the above case, the type of `g1.V` is `Entity` for a generic
//! `g1 : Graph`, and as `V : Entity`, we have `@sing V <: Entity` as required for
//! `Graph & [ .V := V ]` to be a well-formed type.
//!
//! Note that some algorithms simply ignore specializations, for instance
//! [`eval::Evaluator::convertible_ty`]. This is convenient, because it means
//! that checking whether two types are subtypes can be reduced to checking
//! whether they are convertible, and then checking whether a generic element of
//! the first type is an element of the second type. This neatly resolves the
//! difference between `[ x : @sing a ]` and `[ x : Entity ] & [ .x := a ]`,
//! which are represented differently, but should be semantically the same type.

pub mod batch;
pub mod context;
pub mod eval;
pub mod modelgen;
pub mod notebook_elab;
pub mod prelude;
pub mod stx;
pub mod text_elab;
pub mod theory;
pub mod toplevel;
pub mod util;
pub mod val;

#[cfg(doc)]
use stx::*;
#[cfg(doc)]
use val::*;
