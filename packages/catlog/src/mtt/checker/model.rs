//! TODO

use std::marker::PhantomData;

use crate::mtt::{
    ast::{Binder, Decl, Expression, ExpressionProArrow, Model},
    checker::{
        context::{
            DefinitionEntry, GeneratingProArrowEntry, ModelEntry, ObjectEntry, ProTermJudgement,
            RelationEntry,
        },
        core_types::{ObjectTerm, ObjectType},
        error::{CheckResult, EInfer, EType, Error},
    },
    composite::Composite,
    theory::{Theory, TheoryObject, TheoryProArrow},
};

impl<T: Theory> ModelEntry<T> {
    pub fn check_model_ast(&mut self, model_ast: &Model) -> CheckResult {
        let Model { name, decls, theory } = model_ast;
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
                        theory: T::name(),
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
                // stated theory arrow; inferred arrows always satisfy this
                // property.
                if let Some(ref over) = over {
                    self.check_object(&pro_arrow.dom, &over.dom)?;
                    self.check_object(&pro_arrow.cod, &over.cod)?;
                }

                // infer a theory arrow if necessary
                let over = over.map_or_else(
                    || {
                        let t_dom = self.infer_theory_object(&pro_arrow.dom)?;
                        let t_cod = self.infer_theory_object(&pro_arrow.cod)?;
                        self.infer_theory_pro_arrow_by_boundary(&t_dom, &t_cod)
                    },
                    Ok,
                )?;

                if !T::has_pro_arrow(&over) {
                    return Err(EType::InvalidTheoryProArrow {
                        theory: T::name(),
                        pro_arrow: over.to_string(),
                    }
                    .into());
                };

                self.add_pro_arrow(
                    pro_arrow.name,
                    GeneratingProArrowEntry {
                        dom: ObjectEntry {
                            object_type: pro_arrow.dom,
                            over: over.dom,
                        },
                        cod: ObjectEntry {
                            object_type: pro_arrow.cod,
                            over: over.cod,
                        },
                        over: over.name,
                    },
                )
                .map_err(|e| e.into())
            }
            Decl::Definition { name, binder, codomain, over, body } => {
                let judgement = self.build_pro_term_judgement(name, binder, codomain, over)?;
                let pro_term = self.check_pro_term(body, &judgement)?;
                self.add_definition(name.clone(), DefinitionEntry { pro_term, judgement })
                    .map_err(|e| e.into())
            }
            Decl::Relation { name, binder, codomain, over, lhs, rhs } => {
                // TODO: what should name be here?
                let judgement = self.build_pro_term_judgement(name, binder, codomain, over)?;
                let lhs_pro_term = self.check_pro_term(lhs, &judgement)?;
                let rhs_pro_term = self.check_pro_term(rhs, &judgement)?;
                self.add_relation(
                    name.clone(),
                    RelationEntry { lhs_pro_term, rhs_pro_term, judgement },
                )
                .map_err(|e| e.into())
            }
            Decl::Use { .. } => Err(Error::Unimplemented("use".to_string())),
        }
    }

    fn build_pro_term_judgement(
        &self,
        name: &String,
        binder: &Binder,
        codomain: &Expression,
        over: &ExpressionProArrow,
    ) -> Result<ProTermJudgement<T>, Error> {
        // -----------------------------------------------------------
        // domain
        let (domain_object_term, domain_object_type) = self.elaborate_binder(binder)?;
        let domain_theory_object = self.infer_theory_object(&domain_object_type)?;

        // -----------------------------------------------------------
        // codomain
        let codomain_object_type = self.elaborate_object_type(codomain)?;
        let codomain_theory_object = self.infer_theory_object(&codomain_object_type)?;
        let codomain_object_term = ObjectTerm::Variable(name.clone()); // TODO

        // -----------------------------------------------------------
        // theory pro-arrow
        let stated_over = self.elaborate_theory_pro_arrow(over)?;

        // If the user stated an over, check that the outermost domain and
        // codomain objects of the composite are consistent with the declared
        // domain and codomain types; inferred overs always satisfy this.
        if let Some(ref stated) = stated_over {
            // A composite P1;...;Pn spans from the domain of P1 to the codomain
            // of Pn; an empty composite has no boundary to check against.
            let first = stated.iter().next().ok_or(EInfer::EmptyProArrowComposite)?;
            let last = stated.iter().last().ok_or(EInfer::EmptyProArrowComposite)?;
            self.check_object(&domain_object_type, &first.dom)?;
            self.check_object(&codomain_object_type, &last.cod)?;
            for atomic in stated.iter() {
                if !T::has_pro_arrow(atomic) {
                    return Err(EType::InvalidTheoryProArrow {
                        theory: T::name(),
                        pro_arrow: atomic.to_string(),
                    }
                    .into());
                }
            }
        }

        let pro_arrow = Some(match stated_over {
            Some(composite) => composite,
            None => {
                let inferred = self.infer_theory_pro_arrow_by_boundary(
                    &domain_theory_object,
                    &codomain_theory_object,
                )?;
                Composite::try_from(vec![inferred]).expect("singleton is always composable")
            }
        });

        Ok(ProTermJudgement {
            domain_object_term,
            domain_object_type,
            domain_theory_object,
            codomain_object_term,
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
                if !T::objects_unify(&[&oe.over, over]) {
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
                let TheoryObject::ModalApplication { on, .. } = over else {
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
                let inner = self.check_object(on, &function.iter().next().unwrap().dom)?;
                if !T::objects_unify(&[over, &function.iter().last().unwrap().cod]) {
                    todo!("error message here")
                };
                Ok(ObjectType::FunctionApplication {
                    function: function.clone(),
                    on: Box::new(inner),
                })
            }
            ObjectType::Hole { name, over: known } => {
                let over = known.refine(over)?;
                Ok(ObjectType::Hole { name: name.clone(), over })
            }
        }
    }
}

impl<T: Theory> ModelEntry<T> {
    fn infer_theory_object(&self, obj: &ObjectType<T>) -> Result<TheoryObject<T>, Error> {
        match obj {
            ObjectType::Generator(g) => Ok(self.lookup_generating_object(g)?.over.clone()),
            ObjectType::List(list) => {
                let Some(modality) = T::list_modality() else {
                    return Err(EInfer::NoTheoryListModality.into());
                };

                if list.is_empty() {
                    return Ok(TheoryObject::ModalApplication {
                        modality,
                        on: Box::new(TheoryObject::Hole {
                            name: "theory_object_for_empty_list".to_string(),
                            _theory: PhantomData,
                        }),
                    });
                }

                let theory_objects: Vec<TheoryObject<T>> =
                    list.iter().map(|ot| self.infer_theory_object(ot)).collect::<Result<_, _>>()?;
                if !T::objects_unify(&theory_objects.iter().collect::<Vec<&_>>()) {
                    return Err(EInfer::InconsistentTheoryObjectForList.into());
                }

                Ok(TheoryObject::ModalApplication {
                    modality,
                    on: Box::new(
                        TheoryObject::select_most_specific(&theory_objects).unwrap().clone(),
                    ),
                })
            }
            ObjectType::FunctionApplication { function, on } => {
                // TODO: here we are assuming composition order, is there some
                // way to make this explicit or hide it behind an api surface?
                if let Some(outer) = function.iter().last() {
                    // TODO: whose job will it be to check that this application actually makes sense?
                    Ok(outer.cod.clone())
                } else {
                    // TODO: should we be permissive about empty function
                    // composites?
                    self.infer_theory_object(on)
                }
            }
            // The hole already records the theory object it lies over (itself
            // possibly partial); that is exactly what we infer.
            ObjectType::Hole { over, .. } => Ok(over.clone()),
        }
    }

    fn infer_theory_pro_arrow_by_boundary(
        &self,
        t_dom: &TheoryObject<T>,
        t_cod: &TheoryObject<T>,
    ) -> Result<TheoryProArrow<T>, Error> {
        let candidates = T::generating_pro_arrow_by_boundary(t_dom, t_cod);
        match candidates.len() {
            0 => {
                // No named generating pro-arrow fills this boundary. Fall back
                // to the parametric hom pro-arrow, which is never reported by
                // `generating_pro_arrow_by_boundary`.
                T::make_hom_pro_arrow(t_dom, t_cod).map_or(
                    Err(EInfer::NoTheoryProArrow(
                        TheoryProArrow::from("?".to_string(), t_dom.clone(), t_cod.clone())
                            .to_string(),
                    )
                    .into()),
                    Ok,
                )
            }
            1 => {
                let name =
                    candidates.iter().next().expect("we know there's a unique candidate name");
                Ok(T::lookup_generating_pro_arrow(name)
                    .expect("we know this generating pro-arrow exists, the theory must have a bug"))
            }
            _ => {
                // Multiple named generating pro-arrows fill this boundary. As
                // a special case, if the objects coincide we default to
                // inferring hom; otherwise the boundary is ambiguous.
                T::make_hom_pro_arrow(t_dom, t_cod).map_or(
                    Err(EInfer::AmbiguousTheoryProArrow(
                        TheoryProArrow::from("?".to_string(), t_dom.clone(), t_cod.clone())
                            .to_string(),
                    )
                    .into()),
                    Ok,
                )
            }
        }
    }
}
