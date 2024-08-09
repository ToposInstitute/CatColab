/*! Models of double theories.

A model of a double theory is a category (or categories) equipped with
operations specified by the theory, categorifying the familiar idea from logic
that a model of a theory is a set (or sets) equipped with operations. For
background on double theories, see the [`theory`](super::theory) module.

In the case of a *simple* double theory, which amounts to a small double
category, a **model** of the theory is a span-valued *lax* double functor out of
the theory. Such a model is a "lax copresheaf," categorifying the notion of a
copresheaf or set-valued functor. Though they are "just" lax double functors,
models are a [concept with an
attitude](https://ncatlab.org/nlab/show/concept+with+an+attitude). To bring out
the intended intuition we introduce new jargon, building on that for double
theories.

# Terminology

A model of a double theory consists of elements of two kinds:

1. **Objects**, each assigned an object type in the theory;

2. **Morphisms**, each having a domain and a codomain object and assigned a
   morphism type in the theory, compatibly with the domain and codomain types;

In addition, a model has the following operations:

- **Object action**: object operations in the theory act on objects in the model
  to produce new objects;

- **Morphism action**: morphism operations in the theory act on morphisms in
  the model to produce new morphisms, compatibly with the object action;

- **Composition**: a path of morphisms in the model has a composite morphism,
  whose type is the composite of the corresponding morphism types.
 */

use std::hash::Hash;
use std::sync::Arc;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify_next::Tsify;

use super::theory::{DblTheory, DiscreteDblTheory};
use crate::one::fin_category::{FpCategory, InvalidFpCategory};
use crate::one::*;
use crate::validate::{self, Validate};
use crate::zero::{Column, IndexedHashColumn, Mapping};

/** A model of a double theory.

As always in logic, a model makes sense only relative to a theory, but a theory
can have many different models. So, in Rust, a model needs access to its theory
but should not *own* its theory. Implementors of this trait might use an
immutable shared reference to the theory.

Objects and morphisms in a model are typed by object types and morphism types in
the theory. There is a design choice about whether identifiers for objects
([`Ob`](Self::Ob)) and morphisms ([`Mor`](Self::Mor)) are unique relative to
their types or globally within the model. If we took the first approach (as we
do in the Julia package
[ACSets.jl](https://github.com/AlgebraicJulia/ACSets.jl)), one could only make
sense of objects and morphisms when their types are known, so the early methods
in the trait would look like this:

```ignore
fn has_ob(&self, x: &Self::Ob, t: &Self::ObType) -> bool;
fn has_mor(&self, m: &Self::Mor, t: &Self::MorType) -> bool;
fn dom(&self, m: &Self::Mor, t: &Self::MorType) -> Self::Ob;
fn cod(&self, m: &Self::Mor, t: &Self::MorType) -> Self::Ob;
```

It will be more convenient for us to take the second approach since in our usage
object and morphism identifiers will be globally unique in a very strong sense
(something like UUIDs).
 */
pub trait DblModel {
    /** Type of objects in the model.

    Viewing the model as a span-valued double functor, this is the type of
    elements in the sets in the image of the functor.
    */
    type Ob: Eq;

    /** Type of morphisms in the model.

    Viewing the model as a span-valued double functor, this is the type of
    elements in the apexes of the spans in the image of the functor.
    */
    type Mor: Eq;

    /// Rust type of object types defined in the theory.
    type ObType: Eq;

    /// Rust type of morphism types defined in the theory.
    type MorType: Eq;

    /// Type of operations on objects defined in the theory.
    type ObOp: Eq;

    /// Type of operations on morphisms defined in the theory.
    type MorOp: Eq;

    /// Does the model contain the value as an object?
    fn has_ob(&self, x: &Self::Ob) -> bool;

    /// Does the model contain the value as a morphism?
    fn has_mor(&self, m: &Self::Mor) -> bool;

    /// Domain of morphism.
    fn dom(&self, m: &Self::Mor) -> Self::Ob;

    /// Codomain of morphism.
    fn cod(&self, m: &Self::Mor) -> Self::Ob;

    /// Composes a path of morphisms in the model.
    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor;

    /// Composes a pair of morphisms in the model.
    fn compose2(&self, m: Self::Mor, n: Self::Mor) -> Self::Mor {
        self.compose(Path::pair(m, n))
    }

    /// Constructs the identity morphism at an object.
    fn id(&self, x: Self::Ob) -> Self::Mor {
        self.compose(Path::empty(x))
    }

    /// Type of object.
    fn ob_type(&self, x: &Self::Ob) -> Self::ObType;

    /// Type of morphism.
    fn mor_type(&self, m: &Self::Mor) -> Self::MorType;

    /// Acts on an object with an object operation.
    fn ob_act(&self, x: Self::Ob, f: &Self::ObOp) -> Self::Ob;

    /// Acts on a morphism with a morphism operation.
    fn mor_act(&self, m: Self::Mor, α: &Self::MorOp) -> Self::Mor;

    /** Iterates over the basic objects, aka object generators.

    These usually coincide with all of the objects.
    */
    fn objects(&self) -> impl Iterator<Item = Self::Ob>;

    /** Iterates over the basic morphisms, aka morphism generators.

    These rarely exhaust all of the morphisms.
    */
    fn morphisms(&self) -> impl Iterator<Item = Self::Mor>;

    /// Iterates over basic objects of the given type.
    fn objects_with_type(&self, typ: &Self::ObType) -> impl Iterator<Item = Self::Ob>;

    /// Iterates over basic morphisms of the given type.
    fn morphisms_with_type(&self, typ: &Self::MorType) -> impl Iterator<Item = Self::Mor>;

    /// Iterates over basic morphisms with the given domain.
    fn morphisms_with_dom(&self, x: &Self::Ob) -> impl Iterator<Item = Self::Mor>;

    /// Iterates over basic morphisms with the given codomain.
    fn morphisms_with_cod(&self, x: &Self::Ob) -> impl Iterator<Item = Self::Mor>;
}

/** A finitely presented model of a discrete double theory.

Since discrete double theory has only identity operations, such a model is a
finite presentation of a category sliced over the object and morphism types
comprising the theory. A type theorist would call it a ["displayed
category"](https://ncatlab.org/nlab/show/displayed+category).
*/
#[derive(Clone)]
pub struct DiscreteDblModel<Id, Cat: FgCategory> {
    theory: Arc<DiscreteDblTheory<Cat>>,
    category: FpCategory<Id, Id, Id>,
    ob_types: IndexedHashColumn<Id, Cat::Ob>,
    mor_types: IndexedHashColumn<Id, Cat::Hom>,
}

impl<Id, Cat> DiscreteDblModel<Id, Cat>
where
    Id: Eq + Clone + Hash,
    Cat: FgCategory,
    Cat::Ob: Eq + Clone + Hash,
    Cat::Hom: Eq + Clone + Hash,
{
    /// Creates an empty model of the given theory.
    pub fn new(theory: Arc<DiscreteDblTheory<Cat>>) -> Self {
        Self {
            theory,
            category: Default::default(),
            ob_types: Default::default(),
            mor_types: Default::default(),
        }
    }

    /// Graph that generates the object and morphisms of the model.
    pub fn generating_graph(&self) -> &impl FinGraph<V = Id, E = Id> {
        self.category.generators()
    }

    /// Is the model freely generated?
    pub fn is_free(&self) -> bool {
        self.category.is_free()
    }

    /// Adds a basic object to the model.
    pub fn add_ob(&mut self, x: Id, typ: Cat::Ob) -> bool {
        self.ob_types.set(x.clone(), typ);
        self.category.add_ob_generator(x)
    }

    /// Adds a basic morphism to the model.
    pub fn add_mor(&mut self, f: Id, dom: Id, cod: Id, typ: Cat::Hom) -> bool {
        self.mor_types.set(f.clone(), typ);
        self.category.add_hom_generator(f, dom, cod)
    }

    /// Adds a basic morphism to the model without setting its (co)domain.
    pub fn make_mor(&mut self, f: Id, typ: Cat::Hom) -> bool {
        self.mor_types.set(f.clone(), typ);
        self.category.make_hom_generator(f)
    }

    /// Updates the domain of a morphism, setting or unsetting it.
    pub fn update_dom(&mut self, f: Id, x: Option<Id>) -> Option<Id> {
        self.category.update_dom(f, x)
    }

    /// Updates the codomain of a morphism, setting or unsetting it.
    pub fn update_cod(&mut self, f: Id, x: Option<Id>) -> Option<Id> {
        self.category.update_cod(f, x)
    }

    /// Iterates over failures to be well-defined model.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidDiscreteDblModel<Id>> + '_ {
        type Invalid<Id> = InvalidDiscreteDblModel<Id>;
        let category_errors = self.category.iter_invalid().map(|err| match err {
            InvalidFpCategory::Dom(e) => Invalid::Dom(e),
            InvalidFpCategory::Cod(e) => Invalid::Cod(e),
            InvalidFpCategory::EqLhs(eq) => Invalid::EqLhs(eq),
            InvalidFpCategory::EqRhs(eq) => Invalid::EqRhs(eq),
            InvalidFpCategory::EqSrc(eq) => Invalid::EqSrc(eq),
            InvalidFpCategory::EqTgt(eq) => Invalid::EqTgt(eq),
        });
        let type_errors = self.category.hom_generators().flat_map(|f| {
            let mut errs = Vec::new();
            let mor_type = self.mor_type(&f);
            let e = f.only().unwrap();
            if self
                .category
                .get_dom(&e)
                .map_or(false, |x| self.ob_type(x) != self.theory.src(&mor_type))
            {
                errs.push(Invalid::DomType(e.clone()));
            }
            if self
                .category
                .get_cod(&e)
                .map_or(false, |x| self.ob_type(x) != self.theory.tgt(&mor_type))
            {
                errs.push(Invalid::CodType(e));
            }
            errs.into_iter()
        });
        category_errors.chain(type_errors)
    }
}

impl<Id, Cat> DblModel for DiscreteDblModel<Id, Cat>
where
    Id: Eq + Clone + Hash,
    Cat: FgCategory,
    Cat::Ob: Eq + Clone + Hash,
    Cat::Hom: Eq + Clone + Hash,
{
    type Ob = Id;
    type Mor = Path<Id, Id>;
    type ObType = Cat::Ob;
    type MorType = Cat::Hom;
    type ObOp = Cat::Ob;
    type MorOp = Cat::Hom;

    fn has_ob(&self, x: &Self::Ob) -> bool {
        self.category.has_ob(x)
    }
    fn has_mor(&self, m: &Self::Mor) -> bool {
        self.category.has_hom(m)
    }
    fn dom(&self, m: &Self::Mor) -> Self::Ob {
        self.category.dom(m)
    }
    fn cod(&self, m: &Self::Mor) -> Self::Ob {
        self.category.cod(m)
    }
    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor {
        self.category.compose(path)
    }
    fn ob_act(&self, x: Self::Ob, _: &Self::ObOp) -> Self::Ob {
        x
    }
    fn mor_act(&self, m: Self::Mor, _: &Self::MorOp) -> Self::Mor {
        m
    }

    fn ob_type(&self, x: &Self::Ob) -> Self::ObType {
        self.ob_types.apply(x).expect("Object type should be set").clone()
    }

    fn mor_type(&self, m: &Self::Mor) -> Self::MorType {
        let types = m.clone().map(
            |x| self.ob_type(&x),
            |n| self.mor_types.apply(&n).expect("Morphism type should be set").clone(),
        );
        self.theory.compose_types(types)
    }

    fn objects(&self) -> impl Iterator<Item = Self::Ob> {
        self.category.ob_generators()
    }
    fn morphisms(&self) -> impl Iterator<Item = Self::Mor> {
        self.category.hom_generators()
    }
    fn objects_with_type(&self, typ: &Self::ObType) -> impl Iterator<Item = Self::Ob> {
        self.ob_types.preimage(typ)
    }
    fn morphisms_with_type(&self, typ: &Self::MorType) -> impl Iterator<Item = Self::Mor> {
        self.mor_types.preimage(typ).map(Path::single)
    }
    fn morphisms_with_dom(&self, x: &Self::Ob) -> impl Iterator<Item = Self::Mor> {
        self.category.generators_with_dom(x)
    }
    fn morphisms_with_cod(&self, x: &Self::Ob) -> impl Iterator<Item = Self::Mor> {
        self.category.generators_with_cod(x)
    }
}

impl<Id, Cat> Validate for DiscreteDblModel<Id, Cat>
where
    Id: Eq + Clone + Hash,
    Cat: FgCategory,
    Cat::Ob: Eq + Clone + Hash,
    Cat::Hom: Eq + Clone + Hash,
{
    type ValidationError = InvalidDiscreteDblModel<Id>;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

/** A failure of a model of a discrete double theory to be well defined.

TODO: Missing case that equation has different composite morphism types on left
and right hand sides.
*/
#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum InvalidDiscreteDblModel<Id> {
    /// Domain of basic morphism is undefined or invalid.
    Dom(Id),

    /// Codomain of basic morphism is missing or invalid.
    Cod(Id),

    /// Domain of basic morphism has type incompatible with morphism type.
    DomType(Id),

    /// Codomain of basic morphism has type incompatible with morphism type.
    CodType(Id),

    /// Equation has left hand side that is not a well defined path.
    EqLhs(Id),

    /// Equation has right hand side that is not a well defined path.
    EqRhs(Id),

    /// Equation has different sources on left and right hand sides.
    EqSrc(Id),

    /// Equation has different sources on left and right hand sides.
    EqTgt(Id),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::one::fin_category::FinHom;
    use crate::stdlib::theories::*;

    #[test]
    fn validate_discrete_dbl_model() {
        let th = Arc::new(th_schema());
        let mut model = DiscreteDblModel::new(th);
        model.add_ob('x', "Entity".into());
        model.add_ob('t', "AttrType".into());
        model.add_mor('a', 'x', 't', FinHom::Generator("Attr".into()));
        assert!(model.validate().is_ok());
        model.add_mor('b', 'x', 't', FinHom::Id("Entity".into()));
        assert_eq!(model.validate().unwrap_err().len(), 1);
    }
}
