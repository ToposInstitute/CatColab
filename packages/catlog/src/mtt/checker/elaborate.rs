//! TODO
use crate::mtt::{
    ast::{Expression, ExpressionProArrow},
    checker::{ModelGeneratingProArrow, ObjectType, context::ModelEntry, error::EElaborate},
    composite::Composite,
    theory::{Theory, TheoryGeneratingArrow, TheoryObject, TheoryProArrow},
};

/// Procedures for transforming raw AST inputs into various core types. The
/// elaborator performs no checking beyond that of "syntactical" correctness.
/// That is, for example, it is invalid to use lists of literals when specifying
/// a TheoryObject, but whether the resulting TheoryObject is actually in any
/// given theory is beyond the scope of this module.
impl<T: Theory> ModelEntry<T> {
    /// Transform an Expression into a TheoryObject.
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
                    if let Some(modality) = T::list_modality() {
                        let on = Box::new(self.elaborate_theory_object(&pre)?);
                        Ok(TheoryObject::ModalApplication { modality: modality.clone(), on })
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

    /// Transform an ExpressionProArrow into a TheoryProArrow.
    pub fn elaborate_theory_pro_arrow(
        &self,
        arr: &ExpressionProArrow,
    ) -> Result<Option<TheoryProArrow<T>>, EElaborate> {
        match arr {
            ExpressionProArrow::None => Ok(None),
            ExpressionProArrow::NameOnly(name) => {
                let Some(p) = T::lookup_generating_pro_arrow(name) else {
                    return Err(EElaborate::UnknownTheoryProArrow(name.clone()));
                };
                Ok(Some(p.clone()))
            }
            ExpressionProArrow::Complete(arr) => {
                let dom = self.elaborate_theory_object(&arr.dom)?;
                let cod = self.elaborate_theory_object(&arr.cod)?;
                Ok(Some(TheoryProArrow::from(arr.name.clone(), dom, cod)))
            }
        }
    }

    /// Transform an Expression into an ObjectType.
    pub fn elaborate_object_type(&self, obj: &Expression) -> Result<ObjectType<T>, EElaborate> {
        match obj {
            Expression::Literal(lit) => Ok(ObjectType::Generator(lit.clone())),
            Expression::Juxtaposition { .. } => {
                // Similar story as in the elaborate_theroy_object case above
                let mut expr = obj.right_associate_juxtaposition();
                // Once we have this associated form, we extract the "spine" and
                // rework the data into a formal composite of theory generating
                // arrows.
                let mut spine: Vec<TheoryGeneratingArrow<T>> = Vec::new();
                while let Expression::Juxtaposition { post, pre } = expr {
                    let Expression::Literal(fun) = *post else {
                        return Err(EElaborate::InvalidTheoryArrow(post.to_string()));
                    };
                    let Some(arr) = T::lookup_generating_arrow(&fun) else {
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

    /// Transform an ExpressionProArrow into a ModelGeneratingProArrow.
    pub fn elaborate_pro_arrow(
        &self,
        name: &String,
        dom: &Expression,
        cod: &Expression,
    ) -> Result<ModelGeneratingProArrow<T>, EElaborate> {
        let dom = self.elaborate_object_type(dom)?;
        let cod = self.elaborate_object_type(cod)?;
        Ok(ModelGeneratingProArrow::from(name.clone(), dom, cod))
    }
}
