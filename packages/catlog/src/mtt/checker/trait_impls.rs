//! [BinarySignature], [Holy], [Clone], and [Display] implementations for [core_types].

use crate::mtt::{
    binary_signature::BinarySignature,
    checker::{
        ModelGeneratingProArrow,
        context::{Derivation, ProTermJudgement},
        core_types::{ObjectTerm, ObjectType, ProTerm},
    },
    composite::Composite,
    display_helpers::{DHList, DHTuple},
    hole::Holy,
    theory::{Theory, TheoryObject, TheoryProArrow},
};

// -----------------------------------------------------------------------------
// ObjectType

impl<T: Theory> Holy for ObjectType<T> {
    fn unconstrained(name: String) -> Self {
        ObjectType::Hole {
            over: TheoryObject::unconstrained(name.clone()),
            name,
        }
    }

    fn is_hole(&self) -> bool {
        matches!(self, ObjectType::Hole { .. })
    }
}

impl<T: Theory> Clone for ObjectType<T> {
    fn clone(&self) -> Self {
        match self {
            Self::Generator(g) => Self::Generator(g.clone()),
            Self::List(xs) => Self::List(xs.clone()),
            Self::FunctionApplication { function, on } => Self::FunctionApplication {
                function: function.clone(),
                on: on.clone(),
            },
            Self::Hole { name, over } => Self::Hole { name: name.clone(), over: over.clone() },
        }
    }
}

impl<T: Theory> std::fmt::Display for ObjectType<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Generator(g) => write!(f, "{g}"),
            Self::List(xs) => write!(f, "{}", DHList(xs)),
            Self::FunctionApplication { function, on } => write!(f, "{function}({on})"),
            Self::Hole { name, over } => write!(f, "?({name}/{over})"),
        }
    }
}

// -----------------------------------------------------------------------------
// ObjectTerm

impl<T: Theory> Holy for ObjectTerm<T> {
    fn unconstrained(name: String) -> ObjectTerm<T> {
        ObjectTerm::Hole(name)
    }

    fn is_hole(&self) -> bool {
        matches!(self, ObjectTerm::Hole(_))
    }
}

impl<T: Theory> Clone for ObjectTerm<T> {
    fn clone(&self) -> Self {
        match self {
            Self::Variable(v) => Self::Variable(v.clone()),
            Self::List(xs) => Self::List(xs.clone()),
            Self::Tuple(xs) => Self::Tuple(xs.clone()),
            Self::FunctionApplication { function, on } => Self::FunctionApplication {
                function: function.clone(),
                on: on.clone(),
            },
            Self::Hole(h) => Self::Hole(h.clone()),
        }
    }
}

impl<T: Theory> std::fmt::Display for ObjectTerm<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Variable(v) => write!(f, "{v}"),
            Self::List(xs) => write!(f, "{}", DHList(xs)),
            Self::Tuple(xs) => write!(f, "{}", DHTuple(xs)),
            Self::FunctionApplication { function, on } => write!(f, "{function}({on})"),
            Self::Hole(h) => write!(f, "?({h})"),
        }
    }
}

// -----------------------------------------------------------------------------
// Model generating pro-arrow

impl<T: Theory> Clone for ModelGeneratingProArrow<T> {
    fn clone(&self) -> ModelGeneratingProArrow<T> {
        ModelGeneratingProArrow {
            name: self.name.clone(),
            dom: self.dom(),
            cod: self.cod(),
        }
    }
}

impl<T: Theory> BinarySignature<ObjectType<T>> for ModelGeneratingProArrow<T> {
    fn dom(&self) -> ObjectType<T> {
        self.dom.clone()
    }

    fn cod(&self) -> ObjectType<T> {
        self.cod.clone()
    }
}

// -----------------------------------------------------------------------------
// ProTerm

impl<T: Theory> Clone for ProTerm<T> {
    fn clone(&self) -> Self {
        match self {
            ProTerm::Hom { object_term, object_type, theory_object } => ProTerm::Hom {
                object_term: object_term.clone(),
                object_type: object_type.clone(),
                theory_object: theory_object.clone(),
            },
            ProTerm::List(items) => ProTerm::List(items.clone()),
            ProTerm::PostComposition { generator, generator_over, pro_term } => {
                ProTerm::PostComposition {
                    generator: generator.clone(),
                    generator_over: generator_over.clone(),
                    pro_term: pro_term.clone(),
                }
            }
            ProTerm::CellApplication { theory_boundary, on } => ProTerm::CellApplication {
                theory_boundary: theory_boundary.clone(),
                on: on.clone(),
            },
            ProTerm::Restriction { theory_boundary, on } => ProTerm::Restriction {
                theory_boundary: theory_boundary.clone(),
                on: on.clone(),
            },
            ProTerm::ListReindex { before, after, reindex, on } => ProTerm::ListReindex {
                before: before.clone(),
                after: after.clone(),
                reindex: reindex.clone(),
                on: on.clone(),
            },
            ProTerm::Hole(h) => ProTerm::Hole(h.clone()),
        }
    }
}

impl<T: Theory> std::fmt::Display for ProTerm<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProTerm::Hom { object_term, .. } => write!(f, "{object_term}"),
            ProTerm::List(items) => write!(f, "{}", DHList(items)),
            ProTerm::PostComposition { generator, pro_term, .. } => {
                write!(f, "{}({})", generator.name, pro_term)
            }
            ProTerm::CellApplication { on, .. } => write!(f, "cell<{on}>"),
            ProTerm::Restriction { on, .. } => write!(f, "restr<{on}>"),
            ProTerm::ListReindex { reindex, on, .. } => {
                write!(f, "reindex<{on}; {reindex:?}>")
            }
            ProTerm::Hole(h) => write!(f, "?({h})"),
        }
    }
}

impl<T: Theory> Holy for ProTerm<T> {
    fn unconstrained(name: String) -> Self {
        ProTerm::Hole(name)
    }

    fn is_hole(&self) -> bool {
        matches!(self, ProTerm::Hole(_))
    }
}

// -----------------------------------------------------------------------------
// Derivation

impl<T: Theory> Clone for Derivation<T> {
    fn clone(&self) -> Self {
        Derivation {
            pro_term: self.pro_term.clone(),
            judgement: self.judgement.clone(),
        }
    }
}

// -----------------------------------------------------------------------------
// ProTermJudgement

impl<T: Theory> Holy for ProTermJudgement<T> {
    fn unconstrained(name: String) -> Self {
        ProTermJudgement {
            domain_object_term: ObjectTerm::unconstrained(name.clone()),
            domain_object_type: ObjectType::unconstrained(name.clone()),
            domain_theory_object: TheoryObject::unconstrained(name.clone()),
            codomain_object_type: ObjectType::unconstrained(name.clone()),
            codomain_theory_object: TheoryObject::unconstrained(name.clone()),
            pro_arrow: Composite::singleton(TheoryProArrow::unconstrained(name)),
        }
    }

    fn is_hole(&self) -> bool {
        todo!("probably never called")
    }
}

impl<T: Theory> BinarySignature<TheoryObject<T>> for ProTermJudgement<T> {
    fn dom(&self) -> TheoryObject<T> {
        self.domain_theory_object.clone()
    }

    fn cod(&self) -> TheoryObject<T> {
        self.codomain_theory_object.clone()
    }
}

impl<T: Theory> BinarySignature<ObjectType<T>> for ProTermJudgement<T> {
    fn dom(&self) -> ObjectType<T> {
        self.domain_object_type.clone()
    }

    fn cod(&self) -> ObjectType<T> {
        self.codomain_object_type.clone()
    }
}

// -----------------------------------------------------------------------------
// Derivation

impl<T: Theory> BinarySignature<TheoryObject<T>> for Derivation<T> {
    fn dom(&self) -> TheoryObject<T> {
        self.judgement.dom()
    }

    fn cod(&self) -> TheoryObject<T> {
        self.judgement.cod()
    }
}

impl<T: Theory> BinarySignature<ObjectType<T>> for Derivation<T> {
    fn dom(&self) -> ObjectType<T> {
        self.judgement.dom()
    }

    fn cod(&self) -> ObjectType<T> {
        self.judgement.cod()
    }
}
