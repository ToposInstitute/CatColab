//! TODO: Elaboration of a surface body expression into a [ProTerm] [Derivation].

use std::collections::HashMap;

use crate::mtt::{
    ast::Expression,
    binary_signature::BinarySignature,
    checker::{
        EType, Error, ModelGeneratingProArrow, ObjectTerm, ObjectType, ProTerm,
        context::{
            DefinitionEntry, Derivation, GeneratingProArrowEntry, ModelEntry, ProTermJudgement,
        },
        scope::{Scope, ScopeEntry},
    },
    composite::Composite,
    hole::Holy,
    theory::{
        Boundary, Theory, TheoryArrow, TheoryObject, TheoryProArrow, UnificationResult,
        delete_me_pro_arrow_is_constrained,
    },
};

// -----------------------------------------------------------------------------
// Entry point

impl<T: Theory> ModelEntry<T> {
    /// Elaborate a body expression into a pro-term, and check against a
    /// fully-resolved [ProTermJudgement].
    pub fn elaborate_and_check_pro_term(
        &self,
        body: &Expression,
        target: &ProTermJudgement<T>,
    ) -> Result<ProTerm<T>, Error> {
        let scope = self.build_domain_scope(
            &target.domain_object_term,
            &target.domain_object_type,
            &target.domain_theory_object,
        );
        let derivation = self.elaborate_body(body, Some(target), &scope)?;
        Ok(derivation.pro_term)
    }
}

// -----------------------------------------------------------------------------
// Synthesis

impl<T: Theory> ModelEntry<T> {
    fn elaborate_body(
        &self,
        body: &Expression,
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        match body {
            Expression::Literal(x) => self.synthesise_literal(x, hint, scope),
            Expression::Juxtaposition { .. } => self.synthesise_application(body, hint, scope),
            Expression::List(items) => self.synthesise_list(items, hint, scope),
            Expression::Tuple(_) => Err(EType::UnsupportedBody(body.to_string()).into()),
            Expression::ProArrowAnnotation { subject, domain, codomain, over } => {
                let sub_hint = self.elaborate_annotation(domain, codomain, over)?;
                let derivation = self.elaborate_body(subject, Some(&sub_hint), scope)?;
                self.finish(derivation, hint)
            }
        }
    }

    /// Reconcile a synthesised derivation against the hint, if any.
    fn finish(
        &self,
        derivation: Derivation<T>,
        hint: Option<&ProTermJudgement<T>>,
    ) -> Result<Derivation<T>, Error> {
        match hint {
            Some(want) => self.reconcile(derivation, want),
            None => Ok(derivation),
        }
    }

    // It is intentional that we do not allow a free-standing literal to
    // reference an existing definition, for we are requiring "point-ful" style
    // in this type checker so users must always write "f x" even if "f" would
    // suffice.
    fn synthesise_literal(
        &self,
        literal: &String,
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        if let Some(entry) = scope.get(literal) {
            let derivation = self.synthesise_variable(literal, entry)?;
            self.finish(derivation, hint)
        } else if let Ok(ge) = self.lookup_generating_pro_arrow_entry(literal) {
            self.synthesise_post_composition(ge, &Expression::List(Vec::new()), hint, scope)
        } else {
            Err(EType::UnboundVariable(literal.to_string()).into())
        }
    }

    // `Γ ⊢ X: Ob_𝕩` yields `Γ | x: X ⊢_{Hom_𝕩} x: X`.
    fn synthesise_variable(
        &self,
        var: &String,
        entry: &ScopeEntry<T>,
    ) -> Result<Derivation<T>, Error> {
        let hom = T::make_hom_pro_arrow(&entry.theory_object, &entry.theory_object)
            .expect("the hom pro-arrow on an object with itself always exists");
        Ok(Derivation {
            pro_term: ProTerm::Hom {
                object_term: ObjectTerm::Variable(var.to_string()),
                object_type: entry.object_type.clone(),
                theory_object: entry.theory_object.clone(),
            },
            judgement: ProTermJudgement {
                domain_object_term: ObjectTerm::Variable(var.to_string()),
                domain_object_type: entry.object_type.clone(),
                domain_theory_object: entry.theory_object.clone(),
                codomain_object_type: entry.object_type.clone(),
                codomain_theory_object: entry.theory_object.clone(),
                pro_arrow: Composite::singleton(hom),
            },
        })
    }

    fn synthesise_application(
        &self,
        body: &Expression,
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        let Expression::Juxtaposition { post, pre } = body.right_associate_juxtaposition() else {
            unreachable!("re-associating a juxtaposition yields a juxtaposition")
        };
        let Expression::Literal(head) = *post else {
            return Err(EType::UnsupportedBody(body.to_string()).into());
        };

        // It is not correct to mention variables in the head position.
        if let Ok(ge) = self.lookup_generating_pro_arrow_entry(&head) {
            self.synthesise_post_composition(ge, &pre, hint, scope)
        } else if let Some(entry) = self.lookup_definition(&head) {
            self.apply_definition(entry, &pre, hint, scope)
        } else if let Some(arrow) = T::generating_arrow_by_name(&head) {
            self.synthesise_operation_application(arrow, &pre, hint, scope)
        } else {
            Err(EType::NotApplicable(head).into())
        }
    }

    // A theory vertical arrow `g: A -> B` may be applied a pro-term's codomain
    // through a cell whose left boundary is the identity. Thus we may take `Γ |
    // x: X ⊢_P y: Y` (with `Y` over `A`) to `Γ | x: X ⊢_Q g(y): g(Y)` (with
    // `g(Y)` over `B`). The `Q` for which this operation is valid is not
    // determined by the input data alone, and so we rely on `hint` or in its
    // abscence the theory to attempt to infer Q.
    fn synthesise_operation_application(
        &self,
        arrow: TheoryArrow<T>,
        arg: &Expression,
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        // TODO: it would seem that the only useful hint we can pass to the body
        // is that the codomain_theory_object is determined.
        let arg_hint = ProTermJudgement {
            codomain_theory_object: arrow.dom(),
            ..ProTermJudgement::unconstrained("_".to_string())
        };
        // Expand body
        let inner = self.elaborate_body(arg, Some(&arg_hint), scope)?;

        // Make sure that whatever judgement this gives is compatible with the
        // arrow we want to use.
        if !T::unify_objects(&[&inner.judgement.codomain_theory_object, &arrow.dom()])
            .is_compatible()
        {
            return Err(EType::OperationNotApplicable {
                operation: arrow.to_string(),
                onto: inner.judgement.codomain_theory_object.to_string(),
            }
            .into());
        }

        // Construct the boundary of the cell we want to apply.
        let codomain_object_type = ObjectType::FunctionApplication {
            function: Composite::singleton(arrow.clone()),
            on: Box::new(inner.judgement.codomain_object_type.clone()),
        };
        let codomain_theory_object = arrow.cod();

        // Do our best, as discussed in the comment abovet this function, we
        // cannot always be determined from the data we have.
        let cod_proarrow = self.infer_pro_arrow_for_application(
            &arrow,
            hint,
            &inner.judgement.domain_theory_object,
            &codomain_theory_object,
        )?;

        let boundary = Boundary {
            dom_dom_object: inner.judgement.domain_theory_object.clone(),
            dom_cod_object: inner.judgement.codomain_theory_object.clone(),
            cod_dom_object: inner.judgement.domain_theory_object.clone(),
            cod_cod_object: codomain_theory_object.clone(),
            dom_vertical: Composite::empty(),
            dom_proarrow: inner.judgement.pro_arrow.clone(),
            cod_vertical: Composite::singleton(arrow.clone()),
            cod_proarrow: cod_proarrow.clone(),
        };
        if !T::has_cell(&boundary) {
            return Err(EType::NoApplicableCell {
                theory: T::name(),
                operation: arrow.to_string(),
            }
            .into());
        }

        let derivation = Derivation {
            pro_term: ProTerm::CellApplication {
                theory_boundary: boundary,
                on: Box::new(inner.pro_term),
            },
            judgement: ProTermJudgement {
                domain_object_term: inner.judgement.domain_object_term,
                domain_object_type: inner.judgement.domain_object_type,
                domain_theory_object: inner.judgement.domain_theory_object,
                codomain_object_type,
                codomain_theory_object,
                pro_arrow: cod_proarrow,
            },
        };
        self.finish(derivation, hint)
    }

    fn infer_pro_arrow_for_application(
        &self,
        arrow: &TheoryArrow<T>,
        hint: Option<&ProTermJudgement<T>>,
        domain_theory_object: &TheoryObject<T>,
        codomain_theory_object: &TheoryObject<T>,
    ) -> Result<Composite<TheoryProArrow<T>>, Error> {
        match hint {
            Some(want) if delete_me_pro_arrow_is_constrained(&want.pro_arrow) => {
                Ok(want.pro_arrow.clone())
            }
            _ => self
                .infer_theory_pro_arrow_by_boundary(domain_theory_object, codomain_theory_object)
                .map_err(|_| {
                    EType::OperationNeedsAnnotation { operation: arrow.to_string() }.into()
                }),
        }
    }

    // TODO: check this logic
    fn apply_definition(
        &self,
        entry: &DefinitionEntry<T>,
        arg: &Expression,
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        // The formal parameters are the leaves of the definition's binder; the
        // actuals are the leaves of the (surface) argument, paired positionally.
        let formals = object_term_variables(&entry.derivation.judgement.domain_object_term);
        let actuals = argument_leaves(arg);
        if formals.len() != actuals.len() {
            return Err(EType::MalformedBinder {
                term: arg.to_string(),
                object_type: entry.derivation.judgement.domain_object_type.to_string(),
            }
            .into());
        }
        let substitution: HashMap<String, Expression> =
            std::iter::zip(formals, actuals).map(|(f, a)| (f, a.clone())).collect();

        // A definition is inlined at its use site, so the outer hint applies
        // unchanged to the inlined body.
        let inlined = substitute_expression(&entry.body, &substitution);
        self.elaborate_body(&inlined, hint, scope)
    }

    // Post-composition rule: given `Γ | u: X ⊢_P t: Y` and a generating
    // pro-arrow `f: Q(Y, Z)`, derive `Γ | u: X ⊢_{P ⊙ Q} f(t): Z`.
    fn synthesise_post_composition(
        &self,
        generator_entry: &GeneratingProArrowEntry<T>,
        arg: &Expression,
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        // The two relevant pro-arrows here: `Q` and `f` respectively.
        let generator_over = generator_entry.over.clone();
        let generator: ModelGeneratingProArrow<T> = generator_entry.into();

        // Elaborate the argument onto the generator's input boundary, so the
        // composite extends. The outer hint constrains the whole term's
        // pro-arrow `P ⊙ Q`; peeling off the generator's `Q` to recover `P`
        // for the argument is not attempted here, so the argument only inherits
        // the input-boundary constraint.
        let codomain_hint = ProTermJudgement {
            codomain_object_type: generator.dom(),
            codomain_theory_object: generator_over.dom(),
            ..ProTermJudgement::unconstrained(format!("post_comp_with_{generator}"))
        };
        let inner = self.elaborate_body(arg, Some(&codomain_hint), scope)?;

        // Now build `P ⊙ Q` from what we have computed
        let mut over = inner.judgement.pro_arrow.clone();
        if over.extend(generator_over.clone()).is_err() {
            // TODO: actually be helpful with this error
            return Err(EType::CodomainTheoryObjectMismatch {
                expected: generator_over.dom().to_string(),
                found: over.cod().to_string(),
            }
            .into());
        }

        let derivation = Derivation {
            pro_term: ProTerm::PostComposition {
                generator: generator.clone(),
                generator_over: generator_over.clone(),
                pro_term: Box::new(inner.pro_term),
            },
            judgement: ProTermJudgement {
                domain_object_term: inner.judgement.domain_object_term,
                domain_object_type: inner.judgement.domain_object_type,
                domain_theory_object: inner.judgement.domain_theory_object,
                codomain_object_type: generator.cod(),
                codomain_theory_object: generator_over.cod(),
                pro_arrow: over,
            },
        };
        self.finish(derivation, hint)
    }

    /// From `Γ | u_i: X_i ⊢_Q t_i: Y_i` over one common pro-arrow `Q`, build
    /// the list `Γ | [u1,…]: [X1,…] ⊢_{List Q} [t1,…]: [Y1,…]`.
    // TODO: check  this
    fn synthesise_list(
        &self,
        items: &[Expression],
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        let Some(modality) = T::list_modality() else {
            return Err(EType::NoListModality(T::name()).into());
        };

        // We do not currently decompose the list's hint (`List Q`) into a
        // per-element hint (`Q`); the elements synthesise freely and their
        // common pro-arrow is recovered below. The whole list is then finished
        // against the hint.
        let elements = items
            .iter()
            .map(|item| self.elaborate_body(item, None, scope))
            .collect::<Result<Vec<_>, _>>()?;

        // A list lies over `List Q` for a single common atomic `Q`, so every
        // element must already lie over one common pro-arrow. The theory
        // unifies the elements' pro-arrows: failure is a genuine clash. An
        // empty list has no elements to unify and lies over `List Hom` on a
        // hole.
        let overs: Vec<&Composite<TheoryProArrow<T>>> =
            elements.iter().map(|e| &e.judgement.pro_arrow).collect();
        let common = if overs.is_empty() {
            None
        } else {
            match T::unify_pro_arrows(&overs) {
                UnificationResult::MostSpecific(common) => common.only().cloned(),
                UnificationResult::Incompatible => {
                    let found =
                        overs.iter().map(ToString::to_string).collect::<Vec<_>>().join(", ");
                    return Err(EType::HeterogeneousListProArrows { found }.into());
                }
            }
        };

        let modal = |children: Vec<TheoryObject<T>>| -> TheoryObject<T> {
            let child_refs: Vec<&TheoryObject<T>> = children.iter().collect();
            let on = T::unify_objects(&child_refs)
                .most_specific()
                .unwrap_or_else(|| TheoryObject::unconstrained("list_element".to_string()));
            TheoryObject::ModalApplication {
                modality: modality.clone(),
                on: Box::new(on),
            }
        };

        let domain_object_term = ObjectTerm::List(
            elements.iter().map(|e| e.judgement.domain_object_term.clone()).collect(),
        );
        let domain_object_type =
            ObjectType::List(elements.iter().map(BinarySignature::dom).collect());
        let domain_theory_object = modal(elements.iter().map(BinarySignature::dom).collect());
        let codomain_object_type =
            ObjectType::List(elements.iter().map(BinarySignature::cod).collect());
        let codomain_theory_object = modal(elements.iter().map(BinarySignature::cod).collect());

        // The list pro-arrow lifts the common atomic pro-arrow once under the
        // modality, at the list's modal boundary: `List Hom = Hom` when the
        // elements are homs (or the list is empty), else `List Q` for the
        // common generator `Q`.
        let lifted = match &common {
            None | Some(TheoryProArrow::Hom(_)) => {
                T::make_hom_pro_arrow(&domain_theory_object, &codomain_theory_object)
                    .expect("a list of homs lies over the hom on its modal object")
            }
            Some(TheoryProArrow::Generator { name, .. }) => TheoryProArrow::Generator {
                name: name.clone(),
                dom: domain_theory_object.clone(),
                cod: codomain_theory_object.clone(),
            },
            Some(other) => other.clone(),
        };
        let over = Composite::singleton(lifted);

        let derivation = Derivation {
            pro_term: ProTerm::List(elements.into_iter().map(|e| e.pro_term).collect()),
            judgement: ProTermJudgement {
                domain_object_term,
                domain_object_type,
                domain_theory_object,
                codomain_object_type,
                codomain_theory_object,
                pro_arrow: over,
            },
        };
        self.finish(derivation, hint)
    }
}

// -----------------------------------------------------------------------------
// Structural helpers shared by synthesis and reconciliation
// TODO: check below this line

/// The variable names at the leaves of an object term, flattening every list,
/// in left-to-right order. Used to read a definition's formal parameters from
/// its binder. A non-variable leaf would mean a malformed binder, which the
/// binder check rejects upstream.
fn object_term_variables<T: Theory>(term: &ObjectTerm<T>) -> Vec<String> {
    match term {
        ObjectTerm::Variable(v) => vec![v.clone()],
        ObjectTerm::List(items) => items.iter().flat_map(object_term_variables).collect(),
        ObjectTerm::FunctionApplication { on, .. } => object_term_variables(on),
        ObjectTerm::Tuple(_) => todo!("tuple binder formal parameters"),
        ObjectTerm::Hole(_) => unreachable!("checked binder: no holes"),
    }
}

/// The leaves of a (surface) argument expression, flattening every list, in
/// left-to-right order. These are the actuals positionally matched to a
/// definition's formal parameters.
fn argument_leaves(expr: &Expression) -> Vec<&Expression> {
    match expr {
        Expression::List(items) => items.iter().flat_map(argument_leaves).collect(),
        other => vec![other],
    }
}

/// Substitute argument expressions for a definition's formal parameters
/// throughout its body, so the call site can re-synthesise the inlined body.
/// Only the formal *variables* are replaced; every other literal (an operation
/// name, say) is left intact, as are the structural forms, recursing into them.
fn substitute_expression(body: &Expression, subst: &HashMap<String, Expression>) -> Expression {
    match body {
        Expression::Literal(name) => subst.get(name).cloned().unwrap_or_else(|| body.clone()),
        Expression::Juxtaposition { post, pre } => Expression::Juxtaposition {
            post: Box::new(substitute_expression(post, subst)),
            pre: Box::new(substitute_expression(pre, subst)),
        },
        Expression::List(items) => {
            Expression::List(items.iter().map(|i| substitute_expression(i, subst)).collect())
        }
        Expression::Tuple(items) => {
            Expression::Tuple(items.iter().map(|i| substitute_expression(i, subst)).collect())
        }
        Expression::ProArrowAnnotation { subject, domain, codomain, over } => {
            Expression::ProArrowAnnotation {
                subject: Box::new(substitute_expression(subject, subst)),
                domain: domain.clone(),
                codomain: codomain.clone(),
                over: over.clone(),
            }
        }
    }
}
