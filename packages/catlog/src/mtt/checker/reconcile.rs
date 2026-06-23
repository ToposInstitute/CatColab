//! TODO

use crate::mtt::{
    binary_signature::BinarySignature,
    checker::{
        ObjectTerm, ObjectType,
        context::{Derivation, ModelEntry, ProTermJudgement},
        core_types::ProTerm,
        error::{EType, Error},
    },
    composite::Composite,
    theory::{
        Theory, TheoryArrow, TheoryObject, TheoryProArrow, delete_me_pro_arrow_is_constrained,
    },
};

// TODO: check this whole file

impl<T: Theory> ModelEntry<T> {
    /// Relocate `have` onto the boundary `want` demands, returning the
    /// derivation that occupies it. Checks the codomain and domain against the
    /// (possibly partial) target, reshaping the domain by list-monad structure
    /// when the pro-arrow requires it. Errors when an axis cannot be reconciled
    /// and no structure bridges the gap.
    pub fn reconcile(
        &self,
        have: Derivation<T>,
        want: &ProTermJudgement<T>,
    ) -> Result<Derivation<T>, Error> {
        let Derivation { pro_term, judgement } = have;

        // Codomain: checked, never reshaped.
        if !types_unify(&judgement.codomain_object_type, &want.codomain_object_type) {
            return Err(EType::CodomainObjectTypeMismatch {
                expected: want.codomain_object_type.to_string(),
                found: judgement.codomain_object_type.to_string(),
            }
            .into());
        }
        if !T::unify_objects(&[&judgement.codomain_theory_object, &want.codomain_theory_object])
            .is_compatible()
        {
            return Err(EType::CodomainTheoryObjectMismatch {
                expected: want.codomain_theory_object.to_string(),
                found: judgement.codomain_theory_object.to_string(),
            }
            .into());
        }

        // Pro-arrow: if the target constrains it and it is not already met,
        // reshape the domain to bridge the gap.
        let derivation = if delete_me_pro_arrow_is_constrained(&want.pro_arrow)
            && !T::unify_pro_arrows(&[&judgement.pro_arrow, &want.pro_arrow]).is_compatible()
        {
            self.reshape_domain_to(pro_term, judgement, &want.pro_arrow)?
        } else {
            Derivation { pro_term, judgement }
        };

        // Domain: checked against the (possibly partial) binder.
        self.align_domain(derivation, want)
    }

    /// Reshape a derivation's domain by list-monad structure maps so that its
    /// realised pro-arrow meets `want_over`. The wanted pro-arrow's domain
    /// fixes the target modal depth; the leaf sequence is preserved (η/μ do not
    /// touch leaves) and the resulting reindexing must be sanctioned by the
    /// modality. The new pro-arrow is inferred from the reshaped boundary and
    /// required to meet the want.
    fn reshape_domain_to(
        &self,
        pro_term: ProTerm<T>,
        judgement: ProTermJudgement<T>,
        want_over: &Composite<TheoryProArrow<T>>,
    ) -> Result<Derivation<T>, Error> {
        let mismatch = || -> Error {
            EType::ProArrowMismatch {
                expected: want_over.to_string(),
                found: judgement.pro_arrow.to_string(),
            }
            .into()
        };

        let Some(modality) = T::list_modality() else {
            return Err(mismatch());
        };
        // The target domain theory object is the domain of the wanted
        // pro-arrow; the codomain is unchanged (we never reshape it).
        let want_dom = want_over.dom();

        // The reshape preserves the leaf sequence (η/μ do not touch leaves), so
        // the leaf reindexing is the identity; the modality must admit it.
        let leaves = domain_leaf_count(&judgement.domain_object_term);
        let target_leaf: Vec<usize> = (0..leaves).collect();
        if !modality.admits_reindexing(&target_leaf, leaves) {
            return Err(mismatch());
        }

        // The wanted pro-arrow's domain fixes the target modal depth. Rebuild
        // the domain term and type at that depth over the unchanged leaf
        // sequence, then infer the pro-arrow over the new boundary and confirm
        // it meets the want.
        let depth = modal_depth(&want_dom);
        let domain_object_term = reshape_term_to_depth(&judgement.domain_object_term, depth)?;
        let domain_object_type = reshape_type_to_depth(&judgement.domain_object_type, depth)?;
        let new_over =
            self.infer_theory_pro_arrow_by_boundary(&want_dom, &judgement.codomain_theory_object)?;
        if T::unify_pro_arrows(&[&new_over, want_over]).is_compatible() {
            return Err(mismatch());
        }

        Ok(Derivation {
            pro_term: ProTerm::ListManipulation { target_leaf, on: Box::new(pro_term) },
            judgement: ProTermJudgement {
                domain_object_term,
                domain_object_type,
                domain_theory_object: want_dom,
                codomain_object_type: judgement.codomain_object_type,
                codomain_theory_object: judgement.codomain_theory_object,
                pro_arrow: new_over,
            },
        })
    }

    /// Check the synthesised domain against the (possibly partial) target
    /// binder. When the target leaves the domain free (a hole) or the two
    /// already unify --- always, for a unary binder, and for the planar
    /// derivations where synthesis lands on the binder shape --- this is the
    /// identity. A genuine reshape (reordering, duplication, dropping under a
    /// richer modality) is not yet implemented.
    fn align_domain(
        &self,
        derivation: Derivation<T>,
        want: &ProTermJudgement<T>,
    ) -> Result<Derivation<T>, Error> {
        let have = &derivation.judgement;
        let coincides = terms_unify(&have.domain_object_term, &want.domain_object_term)
            && types_unify(&have.domain_object_type, &want.domain_object_type)
            && T::unify_objects(&[&have.domain_theory_object, &want.domain_theory_object])
                .is_compatible();
        if coincides {
            Ok(derivation)
        } else {
            todo!("reindex the induced domain to the binder (reorder / duplicate / drop)")
        }
    }
}

// -----------------------------------------------------------------------------
// Hole-aware unification of model types and terms
//
// A hole unifies with anything; otherwise the two trees must agree
// structurally, bottoming out in theory-object unification.

/// Whether two model object types can be made to coincide.
fn types_unify<T: Theory>(a: &ObjectType<T>, b: &ObjectType<T>) -> bool {
    match (a, b) {
        (ObjectType::Hole { .. }, _) | (_, ObjectType::Hole { .. }) => true,
        (ObjectType::Generator(x), ObjectType::Generator(y)) => x == y,
        (ObjectType::List(xs), ObjectType::List(ys)) => {
            xs.len() == ys.len() && std::iter::zip(xs, ys).all(|(x, y)| types_unify::<T>(x, y))
        }
        (
            ObjectType::FunctionApplication { function: f1, on: o1 },
            ObjectType::FunctionApplication { function: f2, on: o2 },
        ) => verticals_unify::<T>(f1, f2) && types_unify::<T>(o1, o2),
        _ => false,
    }
}

/// Whether two model object terms can be made to coincide.
fn terms_unify<T: Theory>(a: &ObjectTerm<T>, b: &ObjectTerm<T>) -> bool {
    match (a, b) {
        (ObjectTerm::Hole(_), _) | (_, ObjectTerm::Hole(_)) => true,
        (ObjectTerm::Variable(x), ObjectTerm::Variable(y)) => x == y,
        (ObjectTerm::List(xs), ObjectTerm::List(ys)) => {
            xs.len() == ys.len() && std::iter::zip(xs, ys).all(|(x, y)| terms_unify::<T>(x, y))
        }
        (
            ObjectTerm::FunctionApplication { function: f1, on: o1 },
            ObjectTerm::FunctionApplication { function: f2, on: o2 },
        ) => verticals_unify::<T>(f1, f2) && terms_unify::<T>(o1, o2),
        (ObjectTerm::Tuple(_), ObjectTerm::Tuple(_)) => todo!("tuple object-term unification"),
        _ => false,
    }
}

fn verticals_unify<T: Theory>(
    a: &Composite<TheoryArrow<T>>,
    b: &Composite<TheoryArrow<T>>,
) -> bool {
    let a: Vec<_> = a.iter().collect();
    let b: Vec<_> = b.iter().collect();
    a.len() == b.len() && std::iter::zip(a, b).all(|(l, r)| vertical_arrow_unify::<T>(l, r))
}

/// Whether two atomic vertical arrows can be made to coincide: generators by
/// name and boundary, modal applications recursively on modality and inner.
fn vertical_arrow_unify<T: Theory>(l: &TheoryArrow<T>, r: &TheoryArrow<T>) -> bool {
    match (l, r) {
        (
            TheoryArrow::Generator { name: n1, dom: d1, cod: c1 },
            TheoryArrow::Generator { name: n2, dom: d2, cod: c2 },
        ) => {
            n1 == n2
                && T::unify_objects(&[d1, d2]).is_compatible()
                && T::unify_objects(&[c1, c2]).is_compatible()
        }
        (
            TheoryArrow::ModalApplication { modality: m1, on: o1 },
            TheoryArrow::ModalApplication { modality: m2, on: o2 },
        ) => m1 == m2 && vertical_arrow_unify::<T>(o1, o2),
        _ => false,
    }
}

// -----------------------------------------------------------------------------
// Leaf flattening and modal reshaping of domains

/// The number of leaves of a domain object term, i.e. the count of variables
/// reached by flattening every list. The list-monad structure maps (η/μ)
/// preserve this leaf sequence, so a structural reshape is admissible only when
/// the modality admits the identity reindexing on these leaves.
fn domain_leaf_count<T: Theory>(term: &ObjectTerm<T>) -> usize {
    match term {
        ObjectTerm::Variable(_) => 1,
        ObjectTerm::List(items) => items.iter().map(domain_leaf_count::<T>).sum(),
        ObjectTerm::FunctionApplication { on, .. } => domain_leaf_count::<T>(on),
        ObjectTerm::Tuple(_) => todo!("tuple domain leaf count"),
        ObjectTerm::Hole(_) => unreachable!("checked binder: no holes in a synthesised domain"),
    }
}

/// The modal depth of a theory object: the number of list modalities wrapping
/// its generator or hole. `𝕏` has depth 0, `List 𝕏` depth 1, and so on.
fn modal_depth<T: Theory>(obj: &TheoryObject<T>) -> usize {
    match obj {
        TheoryObject::ModalApplication { on, .. } => 1 + modal_depth::<T>(on),
        TheoryObject::Generator(_) | TheoryObject::Hole { .. } => 0,
    }
}

/// Rebuild a domain object term at the given modal depth over its unchanged
/// leaf sequence. This realises the list-monad structure maps (η nests, μ
/// flattens) that the modality always permits: the leaves are read out
/// left-to-right and re-wrapped to the target depth. Depth 1 (a single flat
/// list of the leaves) is the only shape the current derivations require.
fn reshape_term_to_depth<T: Theory>(
    term: &ObjectTerm<T>,
    depth: usize,
) -> Result<ObjectTerm<T>, Error> {
    let mut leaves = Vec::new();
    collect_term_leaves(term, &mut leaves);
    match depth {
        1 => Ok(ObjectTerm::List(leaves.into_iter().cloned().collect())),
        _ => todo!("reshape a domain term to a depth other than one"),
    }
}

/// Rebuild a domain object type at the given modal depth over its unchanged
/// leaf sequence; the type-level counterpart of [reshape_term_to_depth].
fn reshape_type_to_depth<T: Theory>(
    object_type: &ObjectType<T>,
    depth: usize,
) -> Result<ObjectType<T>, Error> {
    let mut leaves = Vec::new();
    collect_type_leaves(object_type, &mut leaves);
    match depth {
        1 => Ok(ObjectType::List(leaves.into_iter().cloned().collect())),
        _ => todo!("reshape a domain type to a depth other than one"),
    }
}

/// Collect the leaf terms of a domain object term left-to-right, flattening
/// every list.
fn collect_term_leaves<'a, T: Theory>(term: &'a ObjectTerm<T>, out: &mut Vec<&'a ObjectTerm<T>>) {
    match term {
        ObjectTerm::List(items) => items.iter().for_each(|i| collect_term_leaves(i, out)),
        other => out.push(other),
    }
}

/// Collect the leaf types of a domain object type left-to-right, flattening
/// every list.
fn collect_type_leaves<'a, T: Theory>(ty: &'a ObjectType<T>, out: &mut Vec<&'a ObjectType<T>>) {
    match ty {
        ObjectType::List(items) => items.iter().for_each(|i| collect_type_leaves(i, out)),
        other => out.push(other),
    }
}
