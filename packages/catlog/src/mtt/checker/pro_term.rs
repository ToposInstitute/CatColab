//! TODO
use std::collections::HashMap;

use crate::mtt::{
    ast::Expression,
    checker::{
        ModelGeneratingProArrow, ObjectTerm, ObjectType,
        context::{DefinitionEntry, ModelEntry, ProTermJudgement},
        core_types::ProTerm,
        error::{EType, Error},
    },
    composite::Composite,
    theory::{HOM, Theory, TheoryGeneratingArrow, TheoryObject, TheoryProArrow},
};

// -----------------------------------------------------------------------------
// Synthesis state

/// The scope a domain binder introduces: each variable the binder names, paired
/// with the object type and theory object at which it stands.
type Scope<T> = HashMap<String, ScopeEntry<T>>;

struct ScopeEntry<T: Theory> {
    object_type: ObjectType<T>,
    theory_object: TheoryObject<T>,
}

/// A synthesised pro-term together with the full boundary it occupies. Both
/// ends are recorded because the synthesised domain need not coincide with the
/// binder, and reconciling the two may insert a further node.
struct Synth<T: Theory> {
    pro_term: ProTerm<T>,
    domain_object_term: ObjectTerm<T>,
    domain_object_type: ObjectType<T>,
    domain_theory_object: TheoryObject<T>,
    codomain_object_type: ObjectType<T>,
    codomain_theory_object: TheoryObject<T>,
    over: Composite<TheoryProArrow<T>>,
}

/// A required end-boundary: the object type and theory object some operation
/// expects at its input (or the judgement expects at the codomain / domain).
struct Boundary<T: Theory> {
    object_type: ObjectType<T>,
    theory_object: TheoryObject<T>,
}

/// The kind of gap between a boundary we *have* and one we *want*, i.e. the
/// node that must be inserted to bridge them.
enum Gap {
    /// The boundaries already coincide; nothing to insert.
    None,
    /// Bridge by a restriction cell the theory sanctions.
    Restriction,
    /// Bridge by an operation/cell application.
    Cell,
    /// Bridge by a list reindexing (permute / duplicate / drop leaves).
    ListManipulation,
}

// -----------------------------------------------------------------------------
// Checking

impl<T: Theory> ModelEntry<T> {
    /// Check a body expression against a fully-resolved [ProTermJudgement].
    pub fn check_pro_term(
        &self,
        body: &Expression,
        target: &ProTermJudgement<T>,
    ) -> Result<ProTerm<T>, Error> {
        let scope = self.build_domain_scope(
            &target.domain_object_term,
            &target.domain_object_type,
            &target.domain_theory_object,
        );
        let synth = self.synthesise(body, &scope)?;
        self.align_to_target(synth, target)
    }
}

// -----------------------------------------------------------------------------
// The gap-filler

impl<T: Theory> ModelEntry<T> {
    /// Classify the gap between a boundary we have and a boundary we want.
    fn classify_gap(&self, have: &Boundary<T>, want: &Boundary<T>) -> Result<Gap, Error> {
        if object_types_match(&have.object_type, &want.object_type)
            && T::objects_unify(&[&have.theory_object, &want.theory_object])
        {
            return Ok(Gap::None);
        }
        todo!("classify a non-trivial boundary gap (restriction / cell / list manipulation)")
    }

    fn fill_codomain_gap(&self, synth: Synth<T>, want: &Boundary<T>) -> Result<Synth<T>, Error> {
        let have = Boundary {
            object_type: synth.codomain_object_type.clone(),
            theory_object: synth.codomain_theory_object.clone(),
        };
        match self.classify_gap(&have, want)? {
            Gap::None => Ok(synth),
            Gap::Restriction => todo!("insert a Restriction at the codomain"),
            Gap::Cell => todo!("insert a CellApplication at the codomain"),
            Gap::ListManipulation => todo!("insert a ListManipulation at the codomain"),
        }
    }

    fn fill_domain_gap(&self, synth: Synth<T>, want: &Boundary<T>) -> Result<Synth<T>, Error> {
        let have = Boundary {
            object_type: synth.domain_object_type.clone(),
            theory_object: synth.domain_theory_object.clone(),
        };
        match self.classify_gap(&have, want)? {
            Gap::None => Ok(synth),
            Gap::Restriction => todo!("wrap with a Restriction at the domain"),
            Gap::Cell => todo!("wrap with a CellApplication at the domain"),
            Gap::ListManipulation => todo!("wrap with a ListManipulation at the domain"),
        }
    }
}

// -----------------------------------------------------------------------------
// Final alignment

impl<T: Theory> ModelEntry<T> {
    fn align_to_target(
        &self,
        synth: Synth<T>,
        target: &ProTermJudgement<T>,
    ) -> Result<ProTerm<T>, Error> {
        let synth = self.fill_domain_gap(
            synth,
            &Boundary {
                object_type: target.domain_object_type.clone(),
                theory_object: target.domain_theory_object.clone(),
            },
        )?;

        // The codomain *term* is not checked: the body *is* the codomain term.
        if !object_types_match(&synth.codomain_object_type, &target.codomain_object_type) {
            return Err(EType::CodomainObjectTypeMismatch {
                expected: target.codomain_object_type.to_string(),
                found: synth.codomain_object_type.to_string(),
            }
            .into());
        }
        if !T::objects_unify(&[&synth.codomain_theory_object, &target.codomain_theory_object]) {
            return Err(EType::CodomainTheoryObjectMismatch {
                expected: target.codomain_theory_object.to_string(),
                found: synth.codomain_theory_object.to_string(),
            }
            .into());
        }
        if let Some(ref target_over) = target.pro_arrow {
            if !pro_arrow_composites_equal::<T>(&synth.over, target_over) {
                return Err(EType::ProArrowMismatch {
                    expected: target_over.to_string(),
                    found: synth.over.to_string(),
                }
                .into());
            }
        }

        Ok(synth.pro_term)
    }
}

// -----------------------------------------------------------------------------
// Bottom-up synthesis

impl<T: Theory> ModelEntry<T> {
    fn synthesise(&self, body: &Expression, scope: &Scope<T>) -> Result<Synth<T>, Error> {
        match body {
            Expression::Literal(x) => self.synthesise_variable(x, scope),
            Expression::Juxtaposition { .. } => self.synthesise_application(body, scope),
            Expression::List(items) => self.synthesise_list(items, scope),
            Expression::Tuple(_) => Err(EType::UnsupportedBody(body.to_string()).into()),
            Expression::ProArrowAnnotation { .. } => {
                todo!("pro-arrow annotation hints in pro-term synthesis")
            }
        }
    }

    fn synthesise_variable(&self, x: &str, scope: &Scope<T>) -> Result<Synth<T>, Error> {
        let Some(entry) = scope.get(x) else {
            return Err(EType::UnboundVariable(x.to_string()).into());
        };
        let hom = T::make_hom_pro_arrow(&entry.theory_object, &entry.theory_object)
            .expect("the hom pro-arrow on an object with itself always exists");
        Ok(Synth {
            pro_term: ProTerm::Hom {
                object_term: ObjectTerm::Variable(x.to_string()),
                object_type: entry.object_type.clone(),
                theory_object: entry.theory_object.clone(),
            },
            domain_object_term: ObjectTerm::Variable(x.to_string()),
            domain_object_type: entry.object_type.clone(),
            domain_theory_object: entry.theory_object.clone(),
            codomain_object_type: entry.object_type.clone(),
            codomain_theory_object: entry.theory_object.clone(),
            over: Composite::try_from(vec![hom]).expect("singleton is always composable"),
        })
    }

    fn synthesise_application(
        &self,
        body: &Expression,
        scope: &Scope<T>,
    ) -> Result<Synth<T>, Error> {
        let Expression::Juxtaposition { post, pre } = body.right_associate_juxtaposition() else {
            unreachable!("re-associating a juxtaposition yields a juxtaposition")
        };
        let Expression::Literal(head) = *post else {
            return Err(EType::UnsupportedBody(body.to_string()).into());
        };

        if self.lookup_generating_pro_arrow_entry(&head).is_ok() {
            self.synthesise_post_composition(&head, &pre, scope)
        } else if let Some(definition) = self.lookup_definition(&head) {
            self.linearise_definition(definition, &pre, scope)
        } else if T::lookup_generating_arrow(&head).is_some() {
            todo!("operation application (vertical arrow / cell) in pro-term synthesis")
        } else {
            Err(EType::NotApplicable(head).into())
        }
    }

    fn synthesise_post_composition(
        &self,
        head: &str,
        rest: &Expression,
        scope: &Scope<T>,
    ) -> Result<Synth<T>, Error> {
        let inner = self.synthesise(rest, scope)?;

        let entry = self.lookup_generating_pro_arrow_entry(&head.to_string())?;
        let generator = ModelGeneratingProArrow::from(
            head.to_string(),
            entry.dom.object_type.clone(),
            entry.cod.object_type.clone(),
        );
        let generator_over = TheoryProArrow::from(
            entry.over.clone(),
            entry.dom.over.clone(),
            entry.cod.over.clone(),
        );
        let codomain_object_type = entry.cod.object_type.clone();
        let codomain_theory_object = entry.cod.over.clone();

        // Reconcile the sub-tower's codomain to the generator's input boundary,
        // inserting any bridging node the gap requires.
        let inner = self.fill_codomain_gap(
            inner,
            &Boundary {
                object_type: entry.dom.object_type.clone(),
                theory_object: entry.dom.over.clone(),
            },
        )?;

        // The boundary now coincides, so the pro-arrows compose.
        let mut over = inner.over.clone();
        over.extend(generator_over.clone())
            .expect("gap-fill aligned the boundary, so the composite extends");

        Ok(Synth {
            pro_term: ProTerm::PostComposition {
                generator,
                generator_over,
                pro_term: Box::new(inner.pro_term),
            },
            domain_object_term: inner.domain_object_term,
            domain_object_type: inner.domain_object_type,
            domain_theory_object: inner.domain_theory_object,
            codomain_object_type,
            codomain_theory_object,
            over,
        })
    }

    fn synthesise_list(&self, items: &[Expression], scope: &Scope<T>) -> Result<Synth<T>, Error> {
        if T::list_modality().is_none() {
            return Err(EType::NoListModality(T::name()).into());
        }
        let children =
            items.iter().map(|e| self.synthesise(e, scope)).collect::<Result<Vec<_>, _>>()?;
        let _ = children;
        todo!("assemble a list pro-term from its synthesised children")
    }

    fn linearise_definition(
        &self,
        definition: &DefinitionEntry<T>,
        argument: &Expression,
        scope: &Scope<T>,
    ) -> Result<Synth<T>, Error> {
        let _ = (definition, argument, scope);
        todo!("linearise a juxtaposed definition into the current tower")
    }
}

// -----------------------------------------------------------------------------
// Scope extraction

impl<T: Theory> ModelEntry<T> {
    /// Build the variable [Scope] introduced by a domain binder. The binder is
    /// assumed already checked against its type, so this is pure extraction.
    fn build_domain_scope(
        &self,
        term: &ObjectTerm<T>,
        object_type: &ObjectType<T>,
        theory_object: &TheoryObject<T>,
    ) -> Scope<T> {
        let mut scope = HashMap::new();
        self.populate_scope(term, object_type, theory_object, &mut scope);
        scope
    }

    fn populate_scope(
        &self,
        term: &ObjectTerm<T>,
        object_type: &ObjectType<T>,
        theory_object: &TheoryObject<T>,
        scope: &mut Scope<T>,
    ) {
        match term {
            ObjectTerm::Variable(x) => {
                scope.insert(
                    x.clone(),
                    ScopeEntry {
                        object_type: object_type.clone(),
                        theory_object: theory_object.clone(),
                    },
                );
            }
            ObjectTerm::List(terms) => {
                let ObjectType::List(types) = object_type else {
                    unreachable!("checked binder: a list term has a list type")
                };
                let TheoryObject::ModalApplication { on, .. } = theory_object else {
                    unreachable!("checked binder: a list type lies over a modal application")
                };
                for (t, ty) in std::iter::zip(terms, types) {
                    self.populate_scope(t, ty, on, scope);
                }
            }
            ObjectTerm::FunctionApplication { .. } => {
                todo!("function-application binder (vertical arrow) scope extraction")
            }
            ObjectTerm::Tuple(_) => todo!("no tuples"),
            ObjectTerm::Hole(_) => unreachable!("checked binder: no holes"),
        }
    }
}

// -----------------------------------------------------------------------------
// Structural comparison helpers

/// Structural equality of model object types.
fn object_types_match<T: Theory>(a: &ObjectType<T>, b: &ObjectType<T>) -> bool {
    match (a, b) {
        (ObjectType::Generator(x), ObjectType::Generator(y)) => x == y,
        (ObjectType::List(xs), ObjectType::List(ys)) => {
            xs.len() == ys.len()
                && std::iter::zip(xs, ys).all(|(x, y)| object_types_match::<T>(x, y))
        }
        (
            ObjectType::FunctionApplication { function: f1, on: o1 },
            ObjectType::FunctionApplication { function: f2, on: o2 },
        ) => vertical_composites_match::<T>(f1, f2) && object_types_match::<T>(o1, o2),
        (ObjectType::Hole { over: oa, .. }, ObjectType::Hole { over: ob, .. }) => {
            T::objects_unify(&[oa, ob])
        }
        _ => false,
    }
}

fn vertical_composites_match<T: Theory>(
    a: &Composite<TheoryGeneratingArrow<T>>,
    b: &Composite<TheoryGeneratingArrow<T>>,
) -> bool {
    let a: Vec<_> = a.iter().collect();
    let b: Vec<_> = b.iter().collect();
    a.len() == b.len()
        && std::iter::zip(a, b).all(|(l, r)| {
            l.name == r.name
                && T::objects_unify(&[&l.dom, &r.dom])
                && T::objects_unify(&[&l.cod, &r.cod])
        })
}

/// Equality of pro-arrow composites up to object unification and the flat
/// hom-collapse (hom is the unit for composition).
fn pro_arrow_composites_equal<T: Theory>(
    a: &Composite<TheoryProArrow<T>>,
    b: &Composite<TheoryProArrow<T>>,
) -> bool {
    let drop_hom = |c: &Composite<TheoryProArrow<T>>| {
        c.iter().filter(|p| p.name != HOM).cloned().collect::<Vec<_>>()
    };
    let a = drop_hom(a);
    let b = drop_hom(b);
    a.len() == b.len()
        && std::iter::zip(a, b).all(|(l, r)| {
            l.name == r.name
                && T::objects_unify(&[&l.dom, &r.dom])
                && T::objects_unify(&[&l.cod, &r.cod])
        })
}
