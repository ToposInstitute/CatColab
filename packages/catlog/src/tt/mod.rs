/*! Type theory for models of a double category

To a first approximation, this is a standard dependent type theory
implementation following Coquand's algorithm, and so we start by explaining what
that looks like.

# Basics of Normalization by Evaluation

There are four data structures that form the core of this implementation, which
may be arranged in a 2x2 grid:

|      | Syntax | Value |
|------|--------|-------|
| Term | [TmS]  | [TmV] |
| Type | [TyS]  | [TyV] |

Evaluation is the process of going from syntax to values. Evaluation is used to
*normalize types*. We need to normalize types because there are many different
syntaxes which may produces the same type. For instance, `b`, and `x.a` where
`x : [ a : @sing b ]` are both the same type. Because types may depend on terms,
we must also normalize terms. (Later we will see that we don't have to normalize
*all* terms, but in a vanilla dependent type theory implementation, one does
have to normalize all terms, and as we are reviewing the basics here, we will
stick to that assumption).

An evaluator for the untyped lambda calculus would look like the following code,
which is in a "rust with a gc" syntax.

```rust
type BwdIdx = usize;

enum TmS {
    Var(BwdIdx),
    App(TmS, TmS),
    Lam(TmS)
}

type Env = Bwd<Closure>;

struct Closure {
    env: Env,
    body: TmS
}

fn eval(env: Env, tm_s: TmS) -> Closure {
    match tm_s {
        TmS::Var(i) => env.lookup(i),
        TmS::App(f, x) => {
            let fv = eval(env, f);
            let xv = eval(env, x);
            eval(fv.env.snoc(xv), fv.body)
        }
        TmS::Lam(body) => Closure { env, body }
    }
}
```

This is a "closed" evaluator for lambda calculus, which means that a value is
*always* a closure. What we need for type theory is an "open" evaluator,
which means that a value is either a closure, or a variable. This permits us
to normalize *past a binding*. For instance, we can normalize `λ x. (λ x. x) x`
to `λ x. x`. This looks like the following:

```rust
type FwdIdx = usize;

enum TmV {
    // f a₁ ... aₙ
    Neu(FwdIdx, Bwd<TmV>),
    Clo(Closure)
}

impl TmV {
    fn app(self, arg: TmV) -> TmV {
        match self {
            TmV::Neu(head, args) => TmV::Neu(head, args.snoc(arg)),
            TmV::Clo(clo) => eval(clo.env.snoc(arg), clo.body)
        }
    }
}

type Env = Bwd<TmV>;

fn eval(env: Env, tm_s: TmS) -> Closure {
    match tm_s {
        TmS::Var(i) => env.lookup(i),
        TmS::App(f, x) => {
           let fv = eval(env, f);
           let xv = eval(env, x);
           fv.app(xv)
        }
        TmS::Lam(body) => TmV::Clo(Closure { env, body })
    }
}

fn quote(scope_len: usize, tm_v: TmV) -> TmS {
    match tm_v {
        TmV::Neu(f, xs) =>
            xs.iter.fold(TmS::Var(scope_len - f - 1), |f, x| TmS::App(f, x)),
        TmV::Clo(clo) => {
            let x_v = TmV::Neu(scope_len, Bwd::Nil);
            let body_v = eval(clo.env.snoc(x_v), clo.body);
            TmS::Lam(quote(scope_len + 1, body_v));
        }
    }
}
```

The normalization procedure is achieved by evaluating then quoting.

In a way, evaluation is kind of like substitution, in that it replaces variables
with values. However, the key difference is that evaluation creates closures
that capture their environment, while substitution does not.

Anyways, that's the basics of normalization by evaluation. We now discuss how
the theory implemented in this module differs from a typical dependent type theory.

# Categories with families, and indexed simple categories with families

DoubleTT is the internal language for a category formed by a Grothendieck construction
of an indexed category. To understand what this means, we will quickly review
the categories-with-families approach to type theory.

A category with families can be described as a big tuple with the following fields.
We write this in a quasi-Agda syntax, with implicit variables.

```text
-- Contexts
Con : Set
-- Substitutions
_⇒_ : Con → Con → Set
-- Types
Ty : Con → Set
-- Terms
Tm : (Γ : Con) → Ty Γ → Set

variable Γ Δ : Con
variable A : Ty _

-- Action of substitutions on types
_[_]ty : Ty Δ → Γ ⇒ Δ → Ty Γ
-- Action of substitutions on terms
_[_]tm : Tm Δ A → (γ : Γ ⇒ Δ) → Tm Γ (A [ γ ]ty)

-- Empty context
· : Con
-- Context with another variable added
_▷_ : (Γ : Con) → Ty Γ → Con

-- Producing a substitution
_,_ : (γ : Γ ⇒ Δ) → Tm Γ (A [ γ ]ty) → Γ ⇒ (Δ ▷ A)
-- The weakening substitution
p : (Γ ▷ A) ⇒ Γ
-- Accessing the variable at the end of the context
q : Tm (Γ ▷ A) (A [ p ]ty)

-- a bunch of laws
...
```

A category with families models the basic judgment structure of dependent type theory,
that is the dependencies between contexts, substitutions, types, and terms.

The type theory behind doublett is given by a category with families that is given
by the Grothendieck construction of an indexed simple category with families. This can
be presented in the following way.

```text
Con₀ : Set
_⇒₀_ : Con₀ → Con₀ → Set
-- Note that types don't depend on contexts anymore
Ty₀ : Set
Tm₀ : Con₀ → Ty₀ → Set

_[_]tm₀ : Tm₀ Δ A → Γ ⇒₀ Δ → Tm₀ Γ A

·₀ : Con₀
_▷₀_ : Con₀ → Ty₀ → Con₀

_,_ : (γ : Γ ⇒₀ Δ) → Tm₀ Γ A → Γ ⇒₀ (Δ ▷₀ A)
p : (Γ ▷₀ A) ⇒₀ Γ
q : Tm (Γ ▷₀ A) A

-- a bunch of laws
...

Con₁ : Con₀ → Set
_⇒₁_ : Con₀ Γ → Con₀ Γ → Set
Ty₁ : Con₀ → Set
Tm₁ : Con₁ Γ → Ty₁ Γ → Set

variables Γ' : Con₁ Γ
variables Δ' Δ'' : Con₁ Δ
variables A' : Ty₁ _

_[_]con₁ : Con₁ Δ → (Γ ⇒₀ Δ) → Con₁ Γ
_[_]⇒₁ : (Δ' ⇒₁ Δ'') → (γ : Γ ⇒₀ Δ) → (Δ' [ γ ]con₁) ⇒₁ (Δ'' [ γ ]con₁)
_[_]ty₁ : Ty₁ Δ → (Γ ⇒₀ Δ) → Ty₁ Γ
_[_]tm₁ : Tm₁ Δ' A' → (γ : Γ ⇒₀ Δ) → Tm₁ (Δ' [ γ ]con₁) (A' [ γ ]ty₁)

-- context and substitution formation, etc.
...
```

The idea for doublett is that the object types are elements of `Ty₀`, and the
morphism types (which depend on objects of certain object types) are elements of
`Ty₁ Γ` (where `Γ` is a `Con₀` which holds the relevant objects). This
separation nicely captures that we only care about a fairly limited form of
dependency; we don't need a general dependent type theory.

However, we want to freely intermix object generators and morphism generators in
a notebook. We produce a type theory which permits this via a Grothendieck construction.


```
Con := (Γ₀ : Con₀) x Con₁ Γ₀
Γ ⇒ Δ := (γ₀ : Γ₀ ⇒₀ Δ₀) x (Γ₁ ⇒₁ (Δ₁ [ γ₀ ]con₁))
Ty Γ := (A₀ : Ty₀) x Ty₁ (Γ₀ ▷₀ A₀)
Tm Γ A := (a₀ : Tm₀ Γ₀ A₀) x Tm₁ Γ₁ (A₁ [ (id Γ₀ , a₀) ]ty₁)
```

We call this the "total" type theory, deriving etymologically from the "total space"
of a fibration.

The internal language of this total type theory is dependent type theory, but
with a twist: no type may ever depend on the second component of a term.

That is, if `F : A → Type` is a type family, and `a` and `a'` are two terms
of type `A` which differ only in their second component, then `F a` and `F a'`
must be the same type.

This means that in the conversion checking apparatus, we don't need to keep
track of the values of morphisms; we represent any morphism as [TmV::Opaque].
Therefore, we don't need to worry about equality checking with respect to
any morphism equalities which we might want to impose.

So to recap, the implementation of doublett is similar to a normal
implementation of dependent type theory, except we take advantage of the way
doublett is built (as a Grothendieck construction) to avoid writing a normalizer
for morphism terms.

# Specializations

There's a third component to doublett, which we call "specialization." Specialization
looks like the following:

```text
type Graph := [
  E : Entity,
  V : Entity,
  src : (Id Entity)[E, V],
  tgt : (Id Entity)[E, V],
]

type Graph2 := [
  V : Entity,
  g1 : Graph & [ .V := V ],
  g2 : Graph & [ .V := V ]
]
```


*/

pub mod batch;
pub mod elab;
pub mod eval;
pub mod prelude;
pub mod stx;
pub mod toplevel;
pub mod util;
pub mod val;

#[cfg(doc)]
use stx::*;
#[cfg(doc)]
use val::*;
