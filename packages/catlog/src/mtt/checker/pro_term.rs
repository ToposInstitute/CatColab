//! Functionality specific to computing derivations from raw AST forms, used in
//! definitions and relations.

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
    display_helpers::DHOption,
    hole::Holy,
    theory::{
        ListModality, Theory, TheoryObject, TheoryProArrow, TheoryVerticalArrow, UnificationResult,
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
        scope: &Scope<T>,
    ) -> Result<ProTerm<T>, Error> {
        let derivation = self.elaborate_body(body, Some(target), scope)?;
        Ok(derivation.pro_term)
    }
}

// -----------------------------------------------------------------------------
// Synthesis

impl<T: Theory> ModelEntry<T> {
    #[tracing::instrument(skip(self, hint, scope), level = "debug", fields(body = %body, hint = %DHOption(hint)))]
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

    #[tracing::instrument(skip(self, derivation, hint), level = "debug", fields(judgement=%derivation.judgement, hint=%DHOption(hint)))]
    fn finish(
        &self,
        derivation: Derivation<T>,
        hint: Option<&ProTermJudgement<T>>,
    ) -> Result<Derivation<T>, Error> {
        match hint {
            // No hint at all: nothing to reconcile.
            None => Ok(derivation),
            // Hint exists but its pro-arrow is unconstrained: the caller
            // has no opinion on the pro-arrow, so accept synthesis as-is.
            Some(want) if !pro_arrow_is_constrained(&want.pro_arrow) => Ok(derivation),
            // Hint is substantive: reconcile against it.
            Some(want) => self.reconcile(derivation, want),
        }
    }

    /// Reconcile a synthesised derivation against the declared target
    /// judgement.
    ///
    /// This is the two-phase procedure by which the type checker bridges the
    /// gap between what synthesis produced and what the declaration demands:
    ///
    /// 1. **Theory-level cell search.** Ask the theory
    ///    ([Theory::cell_search]) whether a flat cell connects the
    ///    synthesised pro-arrow composite to the wanted one. The theory figures
    ///    out the vertical legs itself; those legs may include
    ///    [TheoryArrow::ModalCoherence] wherever the cell's movement involves
    ///    η/μ, plus generator-arrow composites for the theory's own verticals.
    ///    Flatness guarantees at most one such cell.
    ///
    /// 2. **Syntactic domain alignment.** The cell's vertical legs take care of
    ///    the theory-level boundary (including any change in modal depth). The
    ///    last detail is whether the actual domain *terms* line up with the
    ///    declared binder: compute the leaf map from the variable correspondence
    ///    of the two domain object terms, gate it with the modality's
    ///    [ListVariant::admits_reindexing], and emit a [ProTerm::ListReindex]
    ///    if (and only if) the terms don't already coincide.
    ///
    /// There is no codomain reindex: the pro-term *is* the codomain, so any
    /// codomain-level structural change is borne entirely by the cell's
    /// vertical leg, not by a separate pro-term node.
    #[tracing::instrument(skip(self, have), level = "debug", fields(have = %have.judgement, want = %want))]
    fn reconcile(
        &self,
        have: Derivation<T>,
        want: &ProTermJudgement<T>,
    ) -> Result<Derivation<T>, Error> {
        // TODO: check this.
        let Derivation { pro_term, judgement } = have;

        // Phase 1: does the theory have a cell connecting the two pro-arrows?
        tracing::debug!("phase 1: cell_search({} , {})", judgement.pro_arrow, want.pro_arrow);
        let boundary = T::cell_search(&judgement.pro_arrow, &want.pro_arrow).ok_or_else(|| {
            EType::ProArrowMismatch {
                expected: want.pro_arrow.to_string(),
                found: judgement.pro_arrow.to_string(),
            }
        })?;
        tracing::debug!("phase 1: {boundary}");

        // When the cell does not transform the codomain, retain the
        // most-specific model- and theory-level objects obtained by unifying
        // the synthesised and wanted judgements. In particular, this prevents
        // an unconstrained hint from erasing information established during
        // synthesis.
        let (output_codomain_object_type, output_codomain_theory_object) =
            if boundary.cod_vertical.is_empty() {
                let codomain_object_type = match self.unify_object_types(&[
                    &judgement.codomain_object_type,
                    &want.codomain_object_type,
                ]) {
                    UnificationResult::MostSpecific(object_type) => object_type,
                    UnificationResult::Incompatible => {
                        return Err(EType::CodomainObjectTypeMismatch {
                            expected: want.codomain_object_type.to_string(),
                            found: judgement.codomain_object_type.to_string(),
                        }
                        .into());
                    }
                };
                let codomain_theory_object = match T::unify_objects(&[
                    &judgement.codomain_theory_object,
                    &want.codomain_theory_object,
                ]) {
                    UnificationResult::MostSpecific(theory_object) => theory_object,
                    UnificationResult::Incompatible => {
                        return Err(EType::CodomainTheoryObjectMismatch {
                            expected: want.codomain_theory_object.to_string(),
                            found: judgement.codomain_theory_object.to_string(),
                        }
                        .into());
                    }
                };
                (codomain_object_type, codomain_theory_object)
            } else {
                (want.codomain_object_type.clone(), want.codomain_theory_object.clone())
            };

        // Phase 1 wrapping: apply the theory-level cell (e.g. μ) to the
        // synthesised pro-term. An identity cell (both vertical legs empty,
        // as guaranteed by [Theory::cell_search] when the pro-arrows coincide
        // modulo the theory's equations) carries no information, so we elide
        // the [ProTerm::CellApplication] wrapper in that case.
        let after_cell = if boundary.dom_vertical.is_empty() && boundary.cod_vertical.is_empty() {
            tracing::debug!("phase 1: identity cell, eliding CellApplication");
            pro_term
        } else {
            ProTerm::CellApplication {
                theory_boundary: boundary,
                on: Box::new(pro_term),
            }
        };

        // Phase 2: syntactic alignment of the domain terms. The cell has
        // already flattened the domain (e.g. [[r,x],[r,y]] → [r,x,r,y]);
        // now we compute the leaf map from the cell's output to the declared
        // binder and emit a [ProTerm::ListReindex] if they don't coincide.
        // When the wanted domain term is a hole (unconstrained), there is no
        // opinion about variable ordering, so no reindexing is needed.
        tracing::debug!(
            "phase 2: leaf_map({} , {})",
            judgement.domain_object_term,
            want.domain_object_term
        );
        let pro_term = if want.domain_object_term.is_hole() {
            tracing::debug!("phase 2: want is hole, skipping reindex");
            after_cell
        } else {
            let reindex =
                domain_leaf_map::<T>(&judgement.domain_object_term, &want.domain_object_term);
            let is_identity = reindex.iter().enumerate().all(|(i, &j)| i == j);
            if is_identity {
                tracing::debug!("phase 2: identity reindex");
                after_cell
            } else {
                tracing::debug!("phase 2: reindex {:?}", reindex);
                // The modality must admit this leaf map between the two domain
                // shapes.
                if T::has_list_modality() {
                    let source_arity = domain_leaf_count::<T>(&judgement.domain_object_term);
                    if !<T::ListModality as ListModality>::admits_reindexing(&reindex, source_arity)
                    {
                        return Err(EType::DomainMismatch {
                            expected: want.domain_object_term.to_string(),
                            found: judgement.domain_object_term.to_string(),
                        }
                        .into());
                    }
                }
                ProTerm::ListReindex {
                    before: judgement.domain_object_type.clone(),
                    after: want.domain_object_type.clone(),
                    reindex,
                    on: Box::new(after_cell),
                }
            }
        };

        // Build the output judgement. When want's domain_object_term is a
        // hole (e.g. from an annotation), preserve have's actual variable
        // term so it propagates upward to the outermost reconcile where the
        // real binder comparison happens.
        let output_domain_object_term = if want.domain_object_term.is_hole() {
            judgement.domain_object_term
        } else {
            want.domain_object_term.clone()
        };

        Ok(Derivation {
            pro_term,
            judgement: ProTermJudgement {
                domain_object_term: output_domain_object_term,
                codomain_object_type: output_codomain_object_type,
                codomain_theory_object: output_codomain_theory_object,
                ..want.clone()
            },
        })
    }

    // It is intentional that we do not allow a free-standing literal to
    // reference an existing definition, for we are requiring "point-ful" style
    // in this type checker so users must always write "f x" even if "f" would
    // suffice.
    #[tracing::instrument(skip(self, hint, scope), level = "debug", fields(hint = %DHOption(hint)))]
    fn synthesise_literal(
        &self,
        literal: &String,
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        if let Some(entry) = scope.get(literal) {
            let derivation = self.synthesise_variable(literal, entry)?;
            self.finish(derivation, hint)
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

    #[tracing::instrument(skip(self, hint, scope), level = "debug", fields(body = %body, hint = %DHOption(hint)))]
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
        } else if let Some(arrow) = T::generating_vertical_arrow_by_name(&head) {
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
        arrow: TheoryVerticalArrow<T>,
        arg: &Expression,
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        // It would seem that the only useful hint we can pass to the body is
        // that the codomain_theory_object is determined.
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

        let Some(boundary) = T::cell_search(&inner.judgement.pro_arrow, &cod_proarrow) else {
            return Err(EType::NoApplicableCell {
                theory: T::NAME.to_string(),
                operation: arrow.to_string(),
            }
            .into());
        };

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
        arrow: &TheoryVerticalArrow<T>,
        hint: Option<&ProTermJudgement<T>>,
        domain_theory_object: &TheoryObject<T>,
        codomain_theory_object: &TheoryObject<T>,
    ) -> Result<Composite<TheoryProArrow<T>>, Error> {
        match hint {
            Some(want) if pro_arrow_is_constrained(&want.pro_arrow) => Ok(want.pro_arrow.clone()),
            _ => self
                .infer_theory_pro_arrow_by_boundary(domain_theory_object, codomain_theory_object)
                .map_err(|_| {
                    EType::OperationNeedsAnnotation { operation: arrow.to_string() }.into()
                }),
        }
    }

    fn apply_definition(
        &self,
        entry: &DefinitionEntry<T>,
        arg: &Expression,
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        let applicand_vars = extract_variables(&entry.derivation.judgement.domain_object_term);

        let argument_expressions = destruct_expression(arg);

        if applicand_vars.len() != argument_expressions.len() {
            return Err(EType::MalformedBinder {
                term: arg.to_string(),
                object_type: entry.derivation.judgement.domain_object_type.to_string(),
            }
            .into());
        }

        // Check that the proposed substitution from the definition's binder
        // variables to the supplied arguments preserves model object types. A
        // cut argument may be an arbitrary pro-term rather than a variable, so
        // its codomain cannot in general be obtained by a scope lookup and must
        // be synthesised. Definitions currently realise cut by surface
        // substitution and re-elaboration below, so this argument may be
        // synthesised again until cut is implemented differently.
        for (variable, argument) in std::iter::zip(&applicand_vars, &argument_expressions) {
            let expected = entry
                .domain_scope
                .get(variable)
                .expect("the definition scope was built from these variables");
            let actual = self.elaborate_body(argument, None, scope)?;
            if !self
                .unify_object_types(&[
                    &actual.judgement.codomain_object_type,
                    &expected.object_type,
                ])
                .is_compatible()
            {
                return Err(EType::MalformedBinder {
                    term: argument.to_string(),
                    object_type: expected.object_type.to_string(),
                }
                .into());
            }
        }

        let substitution = std::iter::zip(applicand_vars, argument_expressions)
            .map(|(f, a)| (f, a.clone()))
            .collect();

        let inlined = substitute_expression(&entry.body, &substitution);
        self.elaborate_body(&inlined, hint, scope)
    }

    // Post-composition rule: given `Γ | u: X ⊢_P t: Y` and a generating
    // pro-arrow `f: Q(Y, Z)`, derive `Γ | u: X ⊢_{P ⊙ Q} f(t): Z`.
    #[tracing::instrument(skip(self, generator_entry, hint, scope), level = "debug", fields(generator = %generator_entry.name, arg = %arg, hint = %DHOption(hint)))]
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

        // The argument's model-level codomain must agree with the generating
        // pro-arrow's domain
        let generator_dom = generator.dom();
        if !self
            .unify_object_types(&[&inner.judgement.codomain_object_type, &generator_dom])
            .is_compatible()
        {
            return Err(EType::NonComposablePostComposition {
                generator: generator.to_string(),
                onto: inner.judgement.codomain_object_type.to_string(),
            }
            .into());
        }

        // Now build `P ⊙ Q` from what we have computed
        let mut over = inner.judgement.pro_arrow.clone();
        if over.extend(generator_over.clone()).is_err() {
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

    /// Find a common pro-arrow `Q` for a list of synthesised elements, such
    /// that `List(Q)` is compatible with the outer `hint` when present.
    ///
    /// First tries direct unification; on failure, tries each element as the
    /// authority and reconciles the rest against it via cell_search. An
    /// author is only accepted when the resulting `List(Q)` either has no
    /// hint to satisfy or is compatible with the hint's pro-arrow.
    #[tracing::instrument(skip(self, elements, hint), level = "debug", fields(hint = %DHOption(hint)))]
    #[allow(clippy::type_complexity)]
    fn unify_or_reconcile_list_elements(
        &self,
        elements: &[Derivation<T>],
        hint: Option<&ProTermJudgement<T>>,
    ) -> Result<(Composite<TheoryProArrow<T>>, Vec<Derivation<T>>), Error> {
        let overs: Vec<_> = elements.iter().map(|e| &e.judgement.pro_arrow).collect();
        tracing::debug!(
            "element pro-arrows: [{}]",
            overs.iter().map(ToString::to_string).collect::<Vec<_>>().join(", ")
        );

        if let UnificationResult::MostSpecific(common) = T::unify_pro_arrows(&overs) {
            if self.common_compatible_with_hint(&common, hint) {
                tracing::debug!("direct unification succeeded: {common}");
                return Ok((common, elements.to_vec()));
            }
            tracing::debug!("direct unification found {common} but incompatible with hint");
        } else {
            tracing::debug!("direct unification failed, trying author search");
        }

        for author_idx in 0..elements.len() {
            let author_over = &elements[author_idx].judgement.pro_arrow;
            tracing::debug!("trying author {author_idx} over {author_over}");

            let all_reconcilable = elements.iter().enumerate().all(|(i, elem)| {
                if i == author_idx {
                    return true;
                }
                let has_cell = T::cell_search(&elem.judgement.pro_arrow, author_over).is_some();
                tracing::debug!(
                    "  cell_search({}, {author_over}): {}",
                    elem.judgement.pro_arrow,
                    if has_cell { "found" } else { "none" }
                );
                has_cell
            });
            if !all_reconcilable {
                tracing::debug!("author {author_idx} rejected: not all elements have cells");
                continue;
            }

            if let UnificationResult::MostSpecific(common) = T::unify_pro_arrows(&[author_over])
                && !self.common_compatible_with_hint(&common, hint)
            {
                tracing::debug!("author {author_idx} rejected: incompatible with hint");
                continue;
            }

            tracing::debug!("author {author_idx} accepted, reconciling");

            let want = ProTermJudgement {
                pro_arrow: author_over.clone(),
                ..ProTermJudgement::unconstrained("list_element_reconcile".to_string())
            };

            let mut reconciled = Vec::with_capacity(elements.len());
            let mut ok = true;
            for (i, elem) in elements.iter().enumerate() {
                if i == author_idx {
                    reconciled.push(elem.clone());
                } else {
                    match self.reconcile(elem.clone(), &want) {
                        Ok(r) => {
                            tracing::debug!(
                                "  element {i} reconciled to {}",
                                r.judgement.pro_arrow
                            );
                            reconciled.push(r);
                        }
                        Err(e) => {
                            tracing::debug!("  element {i} reconciliation failed: {e}");
                            ok = false;
                            break;
                        }
                    }
                }
            }
            if !ok {
                continue;
            }

            let overs: Vec<_> = reconciled.iter().map(|e| &e.judgement.pro_arrow).collect();
            if let UnificationResult::MostSpecific(common) = T::unify_pro_arrows(&overs) {
                tracing::debug!("author {author_idx} succeeded, common: {common}");
                return Ok((common, reconciled));
            }
            tracing::debug!("author {author_idx} reconciled but final unification failed");
        }

        let found = elements
            .iter()
            .map(|e| e.judgement.pro_arrow.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        Err(EType::HeterogeneousListTheoryProArrow { found }.into())
    }

    /// Whether `List(common)` is compatible with the hint's pro-arrow.
    fn common_compatible_with_hint(
        &self,
        common: &Composite<TheoryProArrow<T>>,
        hint: Option<&ProTermJudgement<T>>,
    ) -> bool {
        let Some(hint) = hint else { return true };
        if !pro_arrow_is_constrained(&hint.pro_arrow) {
            return true;
        }
        let lifted = Composite::try_from(
            common
                .iter()
                .map(|p| TheoryProArrow::ModalApplication(Box::new(p.clone())))
                .collect::<Vec<_>>(),
        );
        match lifted {
            Ok(list_common) => {
                T::unify_pro_arrows(&[&list_common, &hint.pro_arrow]).is_compatible()
            }
            Err(_) => false,
        }
    }

    /// From `Γ | u_i: X_i ⊢_Q t_i: Y_i` over one common pro-arrow `Q`, build
    /// the list `Γ | [u1,…]: [X1,…] ⊢_{List Q} [t1,…]: [Y1,…]`.
    #[tracing::instrument(skip(self, items, hint, scope), level = "debug", fields(len = items.len(), hint = %DHOption(hint)))]
    fn synthesise_list(
        &self,
        items: &[Expression],
        hint: Option<&ProTermJudgement<T>>,
        scope: &Scope<T>,
    ) -> Result<Derivation<T>, Error> {
        if !T::has_list_modality() {
            return Err(EType::NoListModality(T::NAME.to_string()).into());
        }

        // An empty list is the identity on the list-level theory object.
        // The hint's codomain_theory_object tells us what that object is.
        if items.is_empty() {
            let list_theory_object =
                hint.map(|h| h.codomain_theory_object.clone()).unwrap_or_else(|| {
                    TheoryObject::ModalApplication(Box::new(TheoryObject::unconstrained(
                        "empty_list".to_string(),
                    )))
                });
            let hom = T::make_hom_pro_arrow(&list_theory_object, &list_theory_object)
                .expect("hom on an object with itself always exists");
            let derivation = Derivation {
                pro_term: ProTerm::List(vec![]),
                judgement: ProTermJudgement {
                    domain_object_term: ObjectTerm::List(vec![]),
                    domain_object_type: ObjectType::List(vec![]),
                    domain_theory_object: list_theory_object.clone(),
                    codomain_object_type: ObjectType::List(vec![]),
                    codomain_theory_object: list_theory_object,
                    pro_arrow: Composite::singleton(hom),
                },
            };
            return self.finish(derivation, hint);
        }

        let elements = items
            .iter()
            .map(|item| self.elaborate_body(item, None, scope))
            .collect::<Result<Vec<_>, _>>()?;

        // A list lies over `List(Q)` for a common `Q`. Try direct
        // unification first; if that fails, try each element as the
        // authoritative pro-arrow and reconcile the rest against it via
        // cell_search. Flatness guarantees that when multiple authors
        // would work, the results agree.
        let (common, elements) = self.unify_or_reconcile_list_elements(&elements, hint)?;
        let over = Composite::try_from(
            common
                .into_iter()
                .map(|p| TheoryProArrow::ModalApplication(Box::new(p)))
                .collect::<Vec<_>>(),
        )
        .expect("mapping modal operation over a composite should result in a composite");

        let make_modal_object = |theory_objects: Vec<TheoryObject<T>>| -> Result<_, Error> {
            let refs: Vec<&TheoryObject<T>> = theory_objects.iter().collect();
            T::unify_objects(&refs).most_specific().map_or(
                Err(EType::HeterogeneousTheoryObject {
                    found: refs.iter().map(ToString::to_string).collect::<Vec<_>>().join(", "),
                }
                .into()),
                |object| Ok(TheoryObject::ModalApplication(Box::new(object))),
            )
        };

        let domain_object_term = ObjectTerm::List(
            elements.iter().map(|e| e.judgement.domain_object_term.clone()).collect(),
        );

        let domain_object_type =
            ObjectType::List(elements.iter().map(BinarySignature::dom).collect());

        let domain_theory_object =
            make_modal_object(elements.iter().map(BinarySignature::dom).collect())?;

        let codomain_object_type =
            ObjectType::List(elements.iter().map(BinarySignature::cod).collect());

        let codomain_theory_object =
            make_modal_object(elements.iter().map(BinarySignature::cod).collect())?;

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
// Structural helpers for application

fn extract_variables<T: Theory>(term: &ObjectTerm<T>) -> Vec<String> {
    match term {
        ObjectTerm::Variable(v) => vec![v.clone()],
        ObjectTerm::Tuple(items) | ObjectTerm::List(items) => {
            items.iter().flat_map(extract_variables).collect()
        }
        ObjectTerm::FunctionApplication { on, .. } => extract_variables(on),
        ObjectTerm::Hole(_) => {
            unreachable!("checked binders have no holes, and elaboration doesn't produce them")
        }
    }
}

fn destruct_expression(expr: &Expression) -> Vec<&Expression> {
    match expr {
        Expression::Tuple(items) | Expression::List(items) => {
            items.iter().flat_map(destruct_expression).collect()
        }
        // it doesn't matter that these are not potentially not meaningful or
        // incorrect to have in argument positions, the flow of the code is such
        // that we will in-line these values into an expression, and the whole
        // thing will be checked again for validity.
        Expression::Literal(_)
        | Expression::Juxtaposition { .. }
        | Expression::ProArrowAnnotation { .. } => vec![expr],
    }
}

fn substitute_expression(body: &Expression, subst: &HashMap<String, Expression>) -> Expression {
    match body {
        // A literal in the body is either a binder variable (to be substituted)
        // or a named referent (a pro-arrow/definition/theory-arrow name in head
        // position) which must pass through untouched. We know that keys(subst)
        // is exactly the binder variable set, so the `.get` is telling us
        // exactly which class we're in.
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

// -----------------------------------------------------------------------------
// Helpers for reconciliation

fn pro_arrow_is_constrained<T: Theory>(pro_arrow: &Composite<TheoryProArrow<T>>) -> bool {
    !matches!(pro_arrow.only(), Some(p) if p.is_hole())
}

/// The number of leaves of a domain object term, i.e. the count of variables
/// reached by flattening every list. Used to compute the source arity against
/// which the modality checks a reindex.
fn domain_leaf_count<T: Theory>(term: &ObjectTerm<T>) -> usize {
    match term {
        ObjectTerm::Variable(_) => 1,
        ObjectTerm::List(items) => items.iter().map(domain_leaf_count::<T>).sum(),
        ObjectTerm::Tuple(items) => items.iter().map(domain_leaf_count::<T>).sum(),
        ObjectTerm::FunctionApplication { on, .. } => domain_leaf_count::<T>(on),
        ObjectTerm::Hole(_) => {
            unreachable!("checked binders have no holes, and elaboration doesn't produce them")
        }
    }
}

/// Collect the leaf variables of a domain object term left-to-right, flattening
/// every list.
fn collect_domain_leaves<'a, T: Theory>(term: &'a ObjectTerm<T>, out: &mut Vec<&'a String>) {
    match term {
        ObjectTerm::Variable(v) => out.push(v),
        ObjectTerm::List(items) => items.iter().for_each(|i| collect_domain_leaves(i, out)),
        ObjectTerm::Tuple(items) => items.iter().for_each(|i| collect_domain_leaves(i, out)),
        ObjectTerm::FunctionApplication { on, .. } => collect_domain_leaves(on, out),
        ObjectTerm::Hole(_) => {
            unreachable!("checked binders have no holes, and elaboration doesn't produce them")
        }
    }
}

/// Compute the leaf map reindexing `source` onto `target`. The map is
/// determined by variable identity: for each target leaf (read left-to-right),
/// find the index of the matching variable in the source leaves. If a target
/// variable does not appear in the source, the reindex is inadmissible and this
/// returns an identity --- the modality's `admits_reindexing` will then reject
/// it.
fn domain_leaf_map<T: Theory>(source: &ObjectTerm<T>, target: &ObjectTerm<T>) -> Vec<usize> {
    let mut src_leaves = Vec::new();
    collect_domain_leaves::<T>(source, &mut src_leaves);
    let mut tgt_leaves = Vec::new();
    collect_domain_leaves::<T>(target, &mut tgt_leaves);

    tgt_leaves
        .iter()
        .map(|t| src_leaves.iter().position(|s| s == t).unwrap_or(0))
        .collect()
}
