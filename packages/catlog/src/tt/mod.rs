//! Type theory for models of a double category
//!
//! This is developer documentation for those who wish to learn more about how
//! doublett works "under the hood" -- it expects that you already know the basics
//! of how to write double models and morphisms between them using doublett.
//!
//! To a first approximation, the implementation of doublett is a standard dependent
//! type theory implementation following Coquand's algorithm, and so we start by
//! explaining what that looks like.
//!
//! # Basics of Normalization by Evaluation
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
//! normalize types*. We need to normalize types because there are many different
//! syntaxes which may produces the same type. For instance, `b`, and `x.a` where
//! `x : [ a : @sing b ]` are both the same type. Because types may depend on terms,
//! we must also normalize terms. (Later we will see that we don't have to normalize
//! all* terms, but in a vanilla dependent type theory implementation, one does
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
//! always* a closure. What we need for type theory is an "open" evaluator,
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
//! Anyways, that's the basics of normalization by evaluation. We now discuss how
//! the theory implemented in this module differs from a typical dependent type theory.
//!
//! # Categories with families, and indexed simple categories with families
//!
//! DoubleTT is the internal language for a category formed by a Grothendieck construction
//! of an indexed category. To understand what this means, we will quickly review
//! the categories-with-families approach to type theory.
//!
//! A category with families can be described as a big tuple with the following fields.
//! We write this in a quasi-Agda syntax, with implicit variables.
//!
//! ```text
//! -- Contexts
//! Con : Set
//! -- Substitutions
//! _⇒_ : Con → Con → Set
//! -- Types
//! Ty : Con → Set
//! -- Terms
//! Tm : (Γ : Con) → Ty Γ → Set
//!
//! variable Γ Δ : Con
//! variable A : Ty _
//!
//! -- Action of substitutions on types
//! _[_]ty : Ty Δ → Γ ⇒ Δ → Ty Γ
//! -- Action of substitutions on terms
//! _[_]tm : Tm Δ A → (γ : Γ ⇒ Δ) → Tm Γ (A [ γ ]ty)
//!
//! -- Empty context
//! · : Con
//! -- Context with another variable added
//! _▷_ : (Γ : Con) → Ty Γ → Con
//!
//! -- Producing a substitution
//! _,_ : (γ : Γ ⇒ Δ) → Tm Γ (A [ γ ]ty) → Γ ⇒ (Δ ▷ A)
//! -- The weakening substitution
//! p : (Γ ▷ A) ⇒ Γ
//! -- Accessing the variable at the end of the context
//! q : Tm (Γ ▷ A) (A [ p ]ty)
//!
//! -- a bunch of laws
//! ...
//! ```
//!
//! A category with families models the basic judgment structure of dependent type theory,
//! that is the dependencies between contexts, substitutions, types, and terms.
//!
//! The type theory behind doublett is given by a category with families that is given
//! by the Grothendieck construction of an indexed simple category with families. This can
//! be presented in the following way.
//!
//! ```text
//! Con₀ : Set
//! _⇒₀_ : Con₀ → Con₀ → Set
//! -- Note that types don't depend on contexts anymore
//! Ty₀ : Set
//! Tm₀ : Con₀ → Ty₀ → Set
//!
//! _[_]tm₀ : Tm₀ Δ A → Γ ⇒₀ Δ → Tm₀ Γ A
//!
//! ·₀ : Con₀
//! _▷₀_ : Con₀ → Ty₀ → Con₀
//!
//! _,_ : (γ : Γ ⇒₀ Δ) → Tm₀ Γ A → Γ ⇒₀ (Δ ▷₀ A)
//! p : (Γ ▷₀ A) ⇒₀ Γ
//! q : Tm (Γ ▷₀ A) A
//!
//! -- a bunch of laws
//! ...
//!
//! Con₁ : Con₀ → Set
//! _⇒₁_ : Con₀ Γ → Con₀ Γ → Set
//! Ty₁ : Con₀ → Set
//! Tm₁ : Con₁ Γ → Ty₁ Γ → Set
//!
//! variables Γ' : Con₁ Γ
//! variables Δ' Δ'' : Con₁ Δ
//! variables A' : Ty₁ _
//!
//! _[_]con₁ : Con₁ Δ → (Γ ⇒₀ Δ) → Con₁ Γ
//! _[_]⇒₁ : (Δ' ⇒₁ Δ'') → (γ : Γ ⇒₀ Δ) → (Δ' [ γ ]con₁) ⇒₁ (Δ'' [ γ ]con₁)
//! _[_]ty₁ : Ty₁ Δ → (Γ ⇒₀ Δ) → Ty₁ Γ
//! _[_]tm₁ : Tm₁ Δ' A' → (γ : Γ ⇒₀ Δ) → Tm₁ (Δ' [ γ ]con₁) (A' [ γ ]ty₁)
//!
//! -- context and substitution formation, etc.
//! ...
//! ```
//!
//! The idea for doublett is that the object types are elements of `Ty₀`, and the
//! morphism types (which depend on objects of certain object types) are elements of
//! `Ty₁ Γ` (where `Γ` is a `Con₀` which holds the relevant objects). This
//! separation nicely captures that we only care about a fairly limited form of
//! dependency; we don't need a general dependent type theory.
//!
//! However, we want to freely intermix object generators and morphism generators in
//! a notebook. We produce a type theory which permits this via a Grothendieck construction.
//!
//!
//! ```text
//! Con := (Γ₀ : Con₀) x Con₁ Γ₀
//! Γ ⇒ Δ := (γ₀ : Γ₀ ⇒₀ Δ₀) x (Γ₁ ⇒₁ (Δ₁ [ γ₀ ]con₁))
//! Ty Γ := (A₀ : Ty₀) x Ty₁ (Γ₀ ▷₀ A₀)
//! Tm Γ A := (a₀ : Tm₀ Γ₀ A₀) x Tm₁ Γ₁ (A₁ [ (id Γ₀ , a₀) ]ty₁)
//! ```
//!
//! We call this the "total" type theory, deriving etymologically from the "total space"
//! of a fibration.
//!
//! The internal language of this total type theory is dependent type theory, but
//! with a twist: no type may ever depend on the second component of a term.
//!
//! That is, if `F : A → Type` is a type family, and `a` and `a'` are two terms
//! of type `A` which differ only in their second component, then `F a` and `F a'`
//! must be the same type.
//!
//! This means that in the conversion checking apparatus, we don't need to keep
//! track of the values of morphisms; we represent any morphism as [TmV::Opaque].
//! Therefore, we don't need to worry about equality checking with respect to
//! any morphism equalities which we might want to impose.
//!
//! So to recap, the implementation of doublett is similar to a normal
//! implementation of dependent type theory, except we take advantage of the way
//! doublett is built (as a Grothendieck construction) to avoid writing a normalizer
//! for morphism terms.
//!
//! # Specializations
//!
//! There's a third component to doublett, which we call "specialization." We can see
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
//! We can also normalize `g.g1.V` in the context of a variable `g: Graph2`
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
//! specialization, one must first understand subtyping. In doublett, there are
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
//! Mathematically speaking, one could think of specialization as adding a third
//! component to each of the definitions for `Con`, `⇒`, `Ty`, and `Tm` from before.
//! That is, we have a base component, an indexed component, and a specialization
//! component. In the style of presentation that we were using before, this looks
//! like the following:
//!
//! ```text
//! -- a specialization of a type in a context
//! Spcl : Con₀ → Ty₀ → Set
//! -- whether a term satisfies a specialization
//! Sat : Tm₀ Γ A → Spcl Γ A → Prop
//!
//! -- s is a subspecialization of s' if all terms satisfying s also satisfy s'
//! Sub : Spcl Γ A → Spcl Γ A → Prop
//! Sub s s' := ∀ (a : Tm₀ Γ A) . Sat a s → Sat a s'
//!
//! Sing : Tm₀ Γ A → Spcl Γ A
//! Elt : (a : Tm₀ Γ A) → Sat a (Sing a)
//!
//! SCon : Con₀ → Set
//! · : SCon ·
//! _▷s_ : SCon Γ → {A : Ty₀} → Spcl Γ A → SCon (Γ ▷ A)
//!
//! -- A context consists of a base context, an indexed context, and a
//! -- specialization of the base context
//! Con := (Γ₀ : Con₀) x Con₁ Γ₀ x SCon Γ₀
//! -- A type consists of a base type, an indexed type, and a specialization
//! -- of the base type
//! Ty Γ := (A₀ : Ty₀) x Ty₁ (Γ₀ ▷ A₀) x Spcl Γ₀ A₀
//! -- A term consists of a base term, an indexed term, and a proof
//! -- that the term satisfies the specialization of the base type.
//! Tm Γ A := (a₀ : Tm₀ Γ₀ A₀) x Tm₁ Γ₁ (A₁ [ (id , a₀) ]ty₁) x Sat a₀ A₂
//!
//! ...
//! ```
//!
//! However, just as before we do not literally represent types as a base part and
//! an indexed part (we instead implement the projection from total category to base
//! category via `Opaque` values) we do not literally represent types as base part +
//! indexed part + specialized part. Instead, we have some algorithms which simply
//! ignore specializations, and this is equivalent to a projection from (base +
//! indexed + specialized) to (base + indexed). This is the case in, for instance
//! [eval::Evaluator::convertable_ty].
//!
//! This is convenient, because it means that checking whether two types are
//! subtypes can be reduced to checking whether they are convertable, and then
//! checking whether a generic element of the first type is an element of the second
//! type. This neatly resolves the difference between `[ x : @sing a ]` and
//! `[ x : Entity ] & [ .x := a ]`, which are represented differently, but should
//! be semantically the same type.

pub mod batch;
pub mod context;
pub mod eval;
pub mod modelgen;
#[allow(unused)]
pub mod notebook_elab;
pub mod prelude;
pub mod stx;
pub mod text_elab;
pub mod toplevel;
pub mod util;
pub mod val;

#[cfg(doc)]
use stx::*;
#[cfg(doc)]
use val::*;
