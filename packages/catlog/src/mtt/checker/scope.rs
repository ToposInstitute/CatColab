//! The variable scope a domain binder introduces, and its extraction.

use std::collections::HashMap;

use crate::mtt::{
    checker::{ObjectTerm, ObjectType, context::ModelEntry},
    theory::{Theory, TheoryObject},
};

/// The scope a domain binder introduces: each variable the binder names, paired
/// with the object type and theory object over which it stands.
pub type Scope<T> = HashMap<String, ScopeEntry<T>>;

/// A single binding: the object type and theory object at which a bound
/// variable stands.
pub struct ScopeEntry<T: Theory> {
    pub object_type: ObjectType<T>,
    pub theory_object: TheoryObject<T>,
}

impl<T: Theory> ModelEntry<T> {
    /// Build the variable [Scope] introduced by a domain binder. The binder is
    /// assumed already checked against its type, so this is pure extraction.
    pub fn build_domain_scope(
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
                let TheoryObject::ModalApplication { on } = theory_object else {
                    unreachable!("checked binder: a list type lies over a modal application")
                };
                for (t, ty) in std::iter::zip(terms, types) {
                    self.populate_scope(t, ty, on, scope);
                }
            }
            ObjectTerm::FunctionApplication { .. } => {
                todo!("function-application binder (vertical arrow) scope extraction")
            }
            ObjectTerm::Tuple(_) => todo!("tuple binder scope extraction"),
            ObjectTerm::Hole(_) => unreachable!("checked binder: no holes"),
        }
    }
}
