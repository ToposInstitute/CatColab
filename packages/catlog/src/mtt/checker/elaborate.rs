//! TODO
use crate::mtt::{
    ast::{Binder, Expression, ExpressionProArrow},
    checker::{
        ModelGeneratingProArrow, ObjectTerm, ObjectType,
        context::{ModelEntry, ProTermJudgement},
        error::EElaborate,
    },
    composite::Composite,
    hole::Holy,
    theory::{ListModality, Theory, TheoryArrow, TheoryObject, TheoryProArrow},
};

/// Procedures for transforming raw AST inputs into various core types. The
/// elaborator performs no checking beyond that of "syntactical" correctness.
/// That is, for example, it is invalid to use lists of literals when specifying
/// a [TheoryObject], but whether the resulting [TheoryObject] is actually in any
/// given theory is beyond the scope of this module.
impl<T: Theory> ModelEntry<T> {
    /// Transform an [Expression] into a [TheoryObject].
    pub fn elaborate_theory_object(&self, obj: &Expression) -> Result<TheoryObject<T>, EElaborate> {
        match obj {
            // base case: we named a theory object
            Expression::Literal(lit) => Ok(TheoryObject::Generator(lit.clone())),
            // only other allowed case: we named a modality applied to a theory object
            Expression::Juxtaposition { .. } => {
                // we need to elaborate (F G) X as F(G(X)), and we don't do this
                // "through" X as it were, instead we simultaneously recurse on
                // X here and call this as necessary.
                let Expression::Juxtaposition { post, pre } = obj.right_associate_juxtaposition()
                else {
                    panic!("we re-associated a juxtaposition, this must still be a juxtaposition")
                };
                if let Expression::Literal(post) = *post {
                    if <T::ListModality as ListModality>::PRESENT {
                        let on = Box::new(self.elaborate_theory_object(&pre)?);
                        Ok(TheoryObject::ModalApplication { on })
                    } else {
                        Err(EElaborate::UnknownModality(post.clone()))
                    }
                } else {
                    // TODO: this error message could be more specific
                    Err(EElaborate::InvalidTheoryObject(obj.to_string()))
                }
            }
            // these are all invalid for specifying a theory object
            Expression::List(_) | Expression::Tuple(_) | Expression::ProArrowAnnotation { .. } => {
                Err(EElaborate::InvalidTheoryObject(obj.to_string()))
            }
        }
    }

    /// Transform an [ExpressionProArrow] into a single atomic
    /// [TheoryProArrow]. This variant is used by [Decl::ProArrowGenerator],
    /// which must lie over a single generating theory pro-arrow. For the
    /// composite case used by declarations, see
    /// [Self::elaborate_theory_pro_arrow].
    pub fn elaborate_theory_pro_arrow_atomic(
        &self,
        arr: &ExpressionProArrow,
    ) -> Result<Option<TheoryProArrow<T>>, EElaborate> {
        match arr {
            ExpressionProArrow::None => Ok(None),
            ExpressionProArrow::NameOnly(name) => {
                let Some(p) = T::generating_pro_arrow_by_name(name) else {
                    return Err(EElaborate::UnknownTheoryProArrow(name.clone()));
                };
                Ok(Some(p.clone()))
            }
            ExpressionProArrow::Complete(arr) => {
                let dom = self.elaborate_theory_object(&arr.dom)?;
                let cod = self.elaborate_theory_object(&arr.cod)?;
                Ok(Some(TheoryProArrow::Generator { name: arr.name.clone(), dom, cod }))
            }
            ExpressionProArrow::CompositeNameOnly(_) | ExpressionProArrow::CompositeComplete(_) => {
                Err(EElaborate::UnsupportedSyntax(
                    "a composite pro-arrow cannot appear here; generating pro-arrows must lie over a single theory pro-arrow".to_string(),
                ))
            }
        }
    }

    /// Transform an [ExpressionProArrow] into a composite of
    /// [TheoryProArrow]s. This is the form used by [Decl::Definition] and
    /// [Decl::Relation], where the stated pro-arrow may be a composite.
    pub fn elaborate_theory_pro_arrow(
        &self,
        arr: &ExpressionProArrow,
    ) -> Result<Option<Composite<TheoryProArrow<T>>>, EElaborate> {
        match arr {
            ExpressionProArrow::None => Ok(None),
            ExpressionProArrow::NameOnly(name) => {
                let Some(p) = T::generating_pro_arrow_by_name(name) else {
                    return Err(EElaborate::UnknownTheoryProArrow(name.clone()));
                };
                Ok(Some(Composite::singleton(p)))
            }
            ExpressionProArrow::Complete(arr) => {
                let dom = self.elaborate_theory_object(&arr.dom)?;
                let cod = self.elaborate_theory_object(&arr.cod)?;
                Ok(Some(Composite::singleton(TheoryProArrow::Generator {
                    name: arr.name.clone(),
                    dom,
                    cod,
                })))
            }
            ExpressionProArrow::CompositeNameOnly(names) => {
                // NonEmpty guarantees at least one element, so the resulting
                // Composite is never empty.
                let arrows = names
                    .iter()
                    .map(|name| {
                        T::generating_pro_arrow_by_name(name)
                            .ok_or_else(|| EElaborate::UnknownTheoryProArrow(name.clone()))
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(Some(
                    Composite::try_from(arrows)
                        .map_err(EElaborate::InvalidTheoryProArrowComposite)?,
                ))
            }
            ExpressionProArrow::CompositeComplete(arrs) => {
                let arrows = arrs
                    .iter()
                    .map(|arr| {
                        let dom = self.elaborate_theory_object(&arr.dom)?;
                        let cod = self.elaborate_theory_object(&arr.cod)?;
                        Ok(TheoryProArrow::Generator { name: arr.name.clone(), dom, cod })
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(Some(
                    Composite::try_from(arrows)
                        .map_err(EElaborate::InvalidTheoryProArrowComposite)?,
                ))
            }
        }
    }

    /// Transform an [Expression] into an [ObjectType].
    pub fn elaborate_object_type(&self, obj: &Expression) -> Result<ObjectType<T>, EElaborate> {
        match obj {
            Expression::Literal(lit) => Ok(ObjectType::Generator(lit.clone())),
            Expression::Juxtaposition { .. } => {
                // Similar story as in the elaborate_theroy_object case above
                let mut expr = obj.right_associate_juxtaposition();
                // Once we have this associated form, we extract the "spine" and
                // rework the data into a formal composite of theory generating
                // arrows.
                let mut spine: Vec<TheoryArrow<T>> = Vec::new();
                while let Expression::Juxtaposition { post, pre } = expr {
                    let Expression::Literal(fun) = *post else {
                        return Err(EElaborate::InvalidTheoryArrow(post.to_string()));
                    };
                    let Some(arr) = T::generating_arrow_by_name(&fun) else {
                        return Err(EElaborate::UnknownTheoryArrow(fun));
                    };
                    spine.push(arr);
                    expr = *pre;
                }

                let function = Composite::try_from(spine)
                    .map_err(|e| EElaborate::InvalidTheoryArrowComposite(e))?;
                let on = Box::new(self.elaborate_object_type(&expr)?);
                Ok(ObjectType::FunctionApplication { function, on })
            }
            Expression::List(list) => Ok(ObjectType::List(
                list.iter()
                    .map(|o| self.elaborate_object_type(o))
                    .collect::<Result<Vec<_>, _>>()?,
            )),
            Expression::Tuple(_) => Err(EElaborate::UnsupportedSyntax(obj.to_string())),
            Expression::ProArrowAnnotation { .. } => {
                Err(EElaborate::InvalidModelObjectType(obj.to_string()))
            }
        }
    }

    /// Transform the data of a [Expression::ProArrowAnnotation] into a
    /// [ProTermJudgement]. There is data that cannot be deduced from this
    /// alone, which we fill with [ProTermJudgement::unconstrained].
    pub fn elaborate_annotation(
        &self,
        domain: &Expression,
        codomain: &Expression,
        over: &ExpressionProArrow,
    ) -> Result<ProTermJudgement<T>, EElaborate> {
        let unconstrained = ProTermJudgement::unconstrained("_".to_string());
        Ok(ProTermJudgement {
            domain_object_type: self.elaborate_object_type(domain)?,
            codomain_object_type: self.elaborate_object_type(codomain)?,
            // An absent `over` leaves the pro-arrow unconstrained (a hole),
            // never an empty composite.
            pro_arrow: self.elaborate_theory_pro_arrow(over)?.unwrap_or(unconstrained.pro_arrow),
            ..unconstrained
        })
    }

    /// Transform an [ExpressionProArrow] into a [ModelGeneratingProArrow].
    pub fn elaborate_pro_arrow(
        &self,
        name: &String,
        dom: &Expression,
        cod: &Expression,
    ) -> Result<ModelGeneratingProArrow<T>, EElaborate> {
        let dom = self.elaborate_object_type(dom)?;
        let cod = self.elaborate_object_type(cod)?;
        Ok(ModelGeneratingProArrow { name: name.clone(), dom, cod })
    }

    /// Transform an [Expression] into an [ObjectTerm].
    pub fn elaborate_object_term(&self, term: &Expression) -> Result<ObjectTerm<T>, EElaborate> {
        match term {
            Expression::Literal(lit) => Ok(ObjectTerm::Variable(lit.clone())),
            Expression::List(list) => Ok(ObjectTerm::List(
                list.iter()
                    .map(|t| self.elaborate_object_term(t))
                    .collect::<Result<Vec<_>, _>>()?,
            )),
            Expression::Tuple(_tuple) => Err(EElaborate::UnsupportedSyntax(term.to_string())),
            Expression::Juxtaposition { .. } => {
                // Right-associate and peel the spine of theory generating
                // arrows, exactly as in elaborate_object_type.
                let mut expr = term.right_associate_juxtaposition();
                let mut spine: Vec<TheoryArrow<T>> = Vec::new();
                while let Expression::Juxtaposition { post, pre } = expr {
                    let Expression::Literal(fun) = *post else {
                        return Err(EElaborate::InvalidTheoryArrow(post.to_string()));
                    };
                    let Some(arr) = T::generating_arrow_by_name(&fun) else {
                        return Err(EElaborate::UnknownTheoryArrow(fun));
                    };
                    spine.push(arr);
                    expr = *pre;
                }
                let function = Composite::try_from(spine)
                    .map_err(|e| EElaborate::InvalidTheoryArrowComposite(e))?;
                let on = Box::new(self.elaborate_object_term(&expr)?);
                Ok(ObjectTerm::FunctionApplication { function, on })
            }
            Expression::ProArrowAnnotation { .. } => {
                Err(EElaborate::InvalidModelObjectType(term.to_string()))
            }
        }
    }

    pub fn elaborate_binder(
        &self,
        binder: &Binder,
    ) -> Result<(ObjectTerm<T>, ObjectType<T>), EElaborate> {
        let Binder { object_term, object_type } = binder;
        let object_term = self.elaborate_object_term(object_term)?;
        let object_type = self.elaborate_object_type(object_type)?;
        Ok((object_term, object_type))
    }
}
