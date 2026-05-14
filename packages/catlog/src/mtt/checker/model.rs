use std::marker::PhantomData;

use crate::mtt::{
    ast::{Decl, Model},
    checker::{
        ModelGeneratingProArrow, ObjectType, TheoryGeneratingProArrow, TheoryObject,
        constraint::Constraint,
        context::{GeneratingProArrowEntry, ModelEntry, ObjectEntry},
        error::{CheckResult, EInfer, EType, Error},
        hole::{HoleState, Holy},
    },
    theory::Theory,
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
                if T::has_object(&over) {
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

                let over = self.elaborate_theory_pro_arrow(over)?;

                // if we have a theory arrow that we haven't inferred then we
                // must check that the generating arrow actually lies over the
                // stated theory arrow; inferred arrows always satisfy this
                // property.
                if let Some(ref over) = over {
                    self.check_object(&pro_arrow.dom, &over.dom)?;
                    self.check_object(&pro_arrow.cod, &over.cod)?;
                }

                // infer a theory arrow if necessary
                let over = over.unwrap_or(self.infer_theory_generating_pro_arrow(&pro_arrow)?);

                if !T::has_generating_pro_arrow(&over) {
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
                Err(Error::Unimplemented("definition".to_string()))
            }
            Decl::Relation { name, binder, codomain, over, lhs, rhs } => {
                Err(Error::Unimplemented("relation".to_string()))
            }
            Decl::Use { source, local, bindings } => Err(Error::Unimplemented("use".to_string())),
        }
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
            // TODO: we may have to begin recording these constraints somehow?
            ObjectType::Hole { name, constraints } => {
                let constraints = constraints.extend(over)?;
                Ok(ObjectType::Hole { name: name.clone(), constraints })
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
                            constraints: Vec::new(),
                            _theory: PhantomData,
                        }),
                    });
                }

                let theory_objects: Vec<TheoryObject<T>> =
                    list.iter().map(|ot| self.infer_theory_object(ot)).collect::<Result<_, _>>()?;
                // TODO: some of these inferences may be better than others,
                // should we prefer some entry over others when returning? what
                // would that look like?
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
            ObjectType::Hole { name, constraints } => match constraints {
                HoleState::Closed(soln) => Ok(soln.clone()),

                HoleState::Open(known) => Ok(TheoryObject::Hole {
                    name: format!("theory_object_for_{name}"),
                    constraints: known.clone(),
                    _theory: PhantomData,
                }),
            },
        }
    }

    fn infer_theory_generating_pro_arrow(
        &self,
        arr: &ModelGeneratingProArrow<T>,
    ) -> Result<TheoryGeneratingProArrow<T>, Error> {
        let t_dom = self.infer_theory_object(&arr.dom)?;
        let t_cod = self.infer_theory_object(&arr.cod)?;
        let candidates = T::generating_pro_arrow_by_boundary(&t_dom, &t_cod);
        match candidates.len() {
            0 => Err(EInfer::NoTheoryGeneratingProArrow(arr.to_string()).into()),
            1 => {
                let name =
                    candidates.iter().next().expect("we know there's a unique candidate name");
                Ok(T::lookup_generating_pro_arrow(name)
                    .expect("we know this generating pro-arrow exists, the theory must have a bug"))
            }
            _ => {
                // special case, if the theory thinks that the objects are equal
                // then we will default to inferring hom
                T::make_hom_pro_arrow(&t_dom, &t_cod).map_or(
                    Err(EInfer::AmbiguousTheoryGeneratingProArrow(arr.to_string()).into()),
                    Ok,
                )
            }
        }
    }
}
