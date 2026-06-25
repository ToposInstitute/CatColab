//! TODO

use crate::mtt::{
    ast::{Binder, Decl, Expression, ExpressionProArrow, Model},
    binary_signature::BinarySignature,
    checker::{
        context::{
            DefinitionEntry, Derivation, GeneratingProArrowEntry, ModelEntry, ObjectEntry,
            ProTermJudgement, RelationEntry,
        },
        core_types::{ObjectTerm, ObjectType},
        error::{CheckResult, EInfer, EType, Error},
    },
    composite::Composite,
    hole::Holy,
    theory::{ListModality, ProArrowByBoundary, Theory, TheoryObject, TheoryProArrow, UnificationResult},
};

impl<T: Theory> ModelEntry<T> {
    pub fn check_model_ast(&mut self, model_ast: &Model) -> CheckResult {
        let Model { name: _name, decls, theory: _theory } = model_ast;
        // TODO: name
        // TODO: theory
        for decl in decls.iter() {
            self.check_model_decl(decl)?;
        }
        Ok(())
    }

    fn check_model_decl(&mut self, decl: &Decl) -> CheckResult {
        match decl {
            // the two cases for generators we handle in-line, as they are
            // essentially data-less.
            Decl::ObjectGenerator { name, over } => {
                let over = self.elaborate_theory_object(over)?;
                if !T::has_object(&over) {
                    return Err(EType::InvalidTheoryObject {
                        theory: T::NAME.to_string(),
                        object: over.to_string(),
                    }
                    .into());
                }
                self.add_object_type(
                    name.clone(),
                    ObjectEntry {
                        object_type: ObjectType::Generator(name.clone()),
                        over: over.clone(),
                    },
                )
                .map_err(|e| e.into())
            }
            Decl::ProArrowGenerator { name, dom, cod, over } => {
                let pro_arrow = self.elaborate_pro_arrow(name, dom, cod)?;

                let over = self.elaborate_theory_pro_arrow_atomic(over)?;

                // if we have a theory arrow that we haven't inferred then we
                // must check that the generating arrow actually lies over the
                // stated theory arrow
                if let Some(ref over) = over {
                    self.check_object(&pro_arrow.dom, &over.dom())?;
                    self.check_object(&pro_arrow.cod, &over.cod())?;
                }

                // infer a theory arrow if necessary. A generator lies over a
                // single atomic theory pro-arrow, so the inferred filler must
                // be a singleton composite.
                let over = match over {
                    Some(over) => over,
                    None => {
                        let t_dom = self.infer_theory_object(&pro_arrow.dom)?;
                        let t_cod = self.infer_theory_object(&pro_arrow.cod)?;
                        let inferred = self.infer_theory_pro_arrow_by_boundary(&t_dom, &t_cod)?;
                        inferred.only().cloned().ok_or_else(|| {
                            EInfer::NoTheoryProArrow(
                                TheoryProArrow::Generator {
                                    name: "?".to_string(),
                                    dom: t_dom,
                                    cod: t_cod,
                                }
                                .to_string(),
                            )
                        })?
                    }
                };

                if !T::has_pro_arrow(&over) {
                    return Err(EType::InvalidTheoryProArrow {
                        theory: T::NAME.to_string(),
                        pro_arrow: over.to_string(),
                    }
                    .into());
                };

                self.add_pro_arrow(
                    pro_arrow.name.clone(),
                    GeneratingProArrowEntry {
                        name: pro_arrow.name,
                        dom_object_entry: ObjectEntry {
                            object_type: pro_arrow.dom,
                            over: (&over).dom(),
                        },
                        cod_object_entry: ObjectEntry {
                            object_type: pro_arrow.cod,
                            over: (&over).cod(),
                        },
                        over,
                    },
                )
                .map_err(|e| e.into())
            }
            Decl::Definition { name, binder, codomain, over, body } => {
                let judgement = self.build_pro_term_judgement(binder, codomain, over)?;
                let pro_term = self.elaborate_and_check_pro_term(body, &judgement)?;
                self.add_definition(
                    name.clone(),
                    DefinitionEntry {
                        derivation: Derivation { pro_term, judgement },
                        body: body.clone(),
                    },
                )
                .map_err(|e| e.into())
            }
            Decl::Relation { name, binder, codomain, over, lhs, rhs } => {
                let judgement = self.build_pro_term_judgement(binder, codomain, over)?;
                let lhs_pro_term = self.elaborate_and_check_pro_term(lhs, &judgement)?;
                let rhs_pro_term = self.elaborate_and_check_pro_term(rhs, &judgement)?;
                self.add_relation(
                    name.clone(),
                    RelationEntry {
                        lhs: Derivation {
                            pro_term: lhs_pro_term,
                            judgement: judgement.clone(),
                        },
                        rhs: Derivation { pro_term: rhs_pro_term, judgement },
                    },
                )
                .map_err(|e| e.into())
            }
            Decl::Use { .. } => Err(Error::Unimplemented("use".to_string())),
        }
    }

    fn build_pro_term_judgement(
        &self,
        binder: &Binder,
        codomain: &Expression,
        over: &ExpressionProArrow,
    ) -> Result<ProTermJudgement<T>, Error> {
        // -----------------------------------------------------------
        // elaborate the binder and codomain
        let (domain_object_term, domain_object_type) = self.elaborate_binder(binder)?;
        let domain_object_term =
            self.check_object_term(&domain_object_term, &domain_object_type)?;
        let codomain_object_type = self.elaborate_object_type(codomain)?;

        // -----------------------------------------------------------
        // theory pro-arrow, and the theory objects at the boundary
        let stated_over = self.elaborate_theory_pro_arrow(over)?;

        let (domain_theory_object, codomain_theory_object) = match &stated_over {
            Some(stated) => {
                for atomic in stated.iter() {
                    if !T::has_pro_arrow(atomic) {
                        return Err(EType::InvalidTheoryProArrow {
                            theory: T::NAME.to_string(),
                            pro_arrow: atomic.to_string(),
                        }
                        .into());
                    }
                }
                self.check_object(&domain_object_type, &stated.dom())?;
                self.check_object(&codomain_object_type, &stated.cod())?;
                (stated.dom(), stated.cod())
            }
            None => {
                let dom = self.infer_theory_object(&domain_object_type)?;
                let cod = self.infer_theory_object(&codomain_object_type)?;
                (dom, cod)
            }
        };

        let pro_arrow = match stated_over {
            Some(composite) => composite,
            None => self.infer_theory_pro_arrow_by_boundary(
                &domain_theory_object,
                &codomain_theory_object,
            )?,
        };

        Ok(ProTermJudgement {
            domain_object_term,
            domain_object_type,
            domain_theory_object,
            codomain_object_type,
            codomain_theory_object,
            pro_arrow,
        })
    }

    fn check_object(
        &self,
        obj: &ObjectType<T>,
        over: &TheoryObject<T>,
    ) -> Result<ObjectType<T>, Error> {
        match obj {
            ObjectType::Generator(g) => {
                let oe = self.lookup_generating_object(g)?;
                if !T::unify_objects(&[&oe.over, over]).is_compatible() {
                    Err(EType::BadObjectTypeTheoryObject {
                        object_type: obj.to_string(),
                        theory_object: over.to_string(),
                    }
                    .into())
                } else {
                    Ok(obj.clone())
                }
            }
            ObjectType::List(list) => {
                let TheoryObject::ModalApplication { on } = over else {
                    return Err(EType::BadObjectTypeTheoryObject {
                        object_type: obj.to_string(),
                        theory_object: over.to_string(),
                    }
                    .into());
                };
                let list = list
                    .iter()
                    .map(|ot| self.check_object(ot, on))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(ObjectType::List(list))
            }
            ObjectType::FunctionApplication { function, on } => {
                if function.is_empty() {
                    // TODO: should we be permissive about empty function applications?
                    return self.check_object(on, over);
                }
                let inner = self.check_object(on, &function.dom())?;
                if !T::unify_objects(&[over, &function.cod()]).is_compatible() {
                    todo!("error message here")
                };
                Ok(ObjectType::FunctionApplication {
                    function: function.clone(),
                    on: Box::new(inner),
                })
            }
            ObjectType::Hole { name, over: known } => {
                // Refine what we know about the hole's theory object with the
                // freshly-observed `over`. Because a theory object is a linear
                // chain, compatible objects are ordered by prefix-refinement,
                // so the meet is just the more specific of the two; a failure
                // to unify is a genuine conflict.
                let over = T::unify_objects(&[known, over]).most_specific().ok_or_else(|| {
                    EType::BadObjectTypeTheoryObject {
                        object_type: known.to_string(),
                        theory_object: over.to_string(),
                    }
                })?;
                Ok(ObjectType::Hole { name: name.clone(), over })
            }
        }
    }

    fn check_object_term(
        &self,
        term: &ObjectTerm<T>,
        object_type: &ObjectType<T>,
    ) -> Result<ObjectTerm<T>, Error> {
        fn malformed_binder<T: Theory>(term: &ObjectTerm<T>, object_type: &ObjectType<T>) -> Error {
            EType::MalformedBinder {
                term: term.to_string(),
                object_type: object_type.to_string(),
            }
            .into()
        }

        match term {
            // TODO: we don't know anything here, right?
            ObjectTerm::Variable(v) => Ok(ObjectTerm::Variable(v.clone())),
            // Pointwise
            ObjectTerm::List(terms) => {
                let ObjectType::List(types) = object_type else {
                    return Err(malformed_binder(term, object_type));
                };
                if terms.len() != types.len() {
                    return Err(malformed_binder(term, object_type));
                }
                let terms = std::iter::zip(terms, types)
                    .map(|(t, ty)| self.check_object_term(t, ty))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(ObjectTerm::List(terms))
            }
            ObjectTerm::FunctionApplication { .. } => {
                todo!("function-application binder (vertical arrow) checking")
            }
            ObjectTerm::Tuple(_) => Err(EType::TupleBinderUnimplemented.into()),
            ObjectTerm::Hole(_) => Err(EType::HoleInBinder.into()),
        }
    }
}

impl<T: Theory> ModelEntry<T> {
    /// Infer a [TheoryObject] given an [ObjectType].
    pub fn infer_theory_object(&self, obj: &ObjectType<T>) -> Result<TheoryObject<T>, Error> {
        match obj {
            ObjectType::Generator(g) => Ok(self.lookup_generating_object(g)?.over.clone()),
            ObjectType::List(list) => {
                if !<T::ListModality as ListModality>::PRESENT {
                    return Err(EInfer::NoTheoryListModality.into());
                }

                if list.is_empty() {
                    return Ok(TheoryObject::ModalApplication {
                        on: Box::new(TheoryObject::unconstrained(
                            "theory_object_for_empty_list".to_string(),
                        )),
                    });
                }

                let theory_objects: Vec<TheoryObject<T>> =
                    list.iter().map(|ot| self.infer_theory_object(ot)).collect::<Result<_, _>>()?;
                let refs: Vec<&TheoryObject<T>> = theory_objects.iter().collect();
                let UnificationResult::MostSpecific(on) = T::unify_objects(&refs) else {
                    return Err(EInfer::InconsistentTheoryObjectForList.into());
                };

                Ok(TheoryObject::ModalApplication { on: Box::new(on) })
            }
            ObjectType::FunctionApplication { function, on } => {
                if function.is_empty() {
                    // TODO: should we be permissive about empty function
                    // composites?
                    self.infer_theory_object(on)
                } else {
                    // TODO: whose job will it be to check that this application actually makes sense?
                    Ok(function.cod())
                }
            }
            // The hole already records the theory object it lies over (itself
            // possibly partial); that is exactly what we infer.
            ObjectType::Hole { over, .. } => Ok(over.clone()),
        }
    }

    /// Infer the theory pro-arrow composite filling a boundary, thin wrapper
    /// around the theory.
    pub fn infer_theory_pro_arrow_by_boundary(
        &self,
        t_dom: &TheoryObject<T>,
        t_cod: &TheoryObject<T>,
    ) -> Result<Composite<TheoryProArrow<T>>, Error> {
        let unknown = || {
            TheoryProArrow::Generator {
                name: "?".to_string(),
                dom: t_dom.clone(),
                cod: t_cod.clone(),
            }
            .to_string()
        };
        match T::pro_arrow_by_boundary(t_dom, t_cod) {
            ProArrowByBoundary::Composite(composite) => Ok(composite),
            ProArrowByBoundary::Hom(hom) => Ok(Composite::singleton(hom)),
            ProArrowByBoundary::None => Err(EInfer::NoTheoryProArrow(unknown()).into()),
            ProArrowByBoundary::Ambiguous => Err(EInfer::AmbiguousTheoryProArrow(unknown()).into()),
        }
    }
}
