//! TODO

use derive_more::Display;
use textwrap::indent;

use std::collections::HashMap;

use crate::mtt::{
    ast::Expression,
    checker::{
        ModelGeneratingProArrow,
        core_types::{ObjectTerm, ObjectType, ProTerm},
        error::EContext,
    },
    composite::Composite,
    display_helpers::DHMap,
    theory::{Theory, TheoryObject, TheoryProArrow},
};

#[derive(Display)]
#[display("{object_type}/{over}")]
/// A context entry recording a well-founded object type in the model.
pub struct ObjectEntry<T: Theory> {
    /// The object type.
    pub object_type: ObjectType<T>,
    /// The theory object over which this object type lives.
    pub over: TheoryObject<T>,
}

#[derive(Display)]
#[display("{dom_object_entry} -|-> {cod_object_entry} over {over}")]
/// A context entry recording a well-founded generating pro-arrow in the model.
/// We store these entries indexed by their name, so there is no further data
/// beyond those fields below. Explicit in this particular arrangement of data
/// is the notion that a generating pro-arrow for the model may only live over a
/// generating pro-arrow for the theory. In the future we may wish to lift this
/// restriction.
pub struct GeneratingProArrowEntry<T: Theory> {
    /// A redundant copy of the name of the pro-arrow generator, so that the
    /// data is enough to recover the [ModelGeneratingProArrow] that is
    /// implicitly recorded here.
    pub name: String,
    /// The domain object type.
    pub dom_object_entry: ObjectEntry<T>,
    /// The codomain object type.
    pub cod_object_entry: ObjectEntry<T>,
    /// The theory pro-arrow over which this object lives.
    pub over: TheoryProArrow<T>,
}

impl<T: Theory> From<&GeneratingProArrowEntry<T>> for ModelGeneratingProArrow<T> {
    fn from(ge: &GeneratingProArrowEntry<T>) -> ModelGeneratingProArrow<T> {
        ModelGeneratingProArrow {
            name: ge.name.clone(),
            dom: ge.dom_object_entry.object_type.clone(),
            cod: ge.cod_object_entry.object_type.clone(),
        }
    }
}

#[derive(Display)]
#[display(
    "{domain_object_term}: {domain_object_type}/{domain_theory_object} ⊢_{{{pro_arrow}}} {codomain_object_type}/{codomain_theory_object}"
)]
/// The boundary of a pro-term derivation. The derivation itself is the
/// [ProTerm]; this records the data shared by every derivation of it. In what
/// follows we refer to "Γ | x : X ⊢_P Y", noting that the codomain term is the
/// pro-term, so it has no separate slot here.
pub struct ProTermJudgement<T: Theory> {
    /// The portion "x" in the above.
    pub domain_object_term: ObjectTerm<T>,
    /// The portion "X" in the above.
    pub domain_object_type: ObjectType<T>,
    /// The object of the theory over which "X" lies, None for holes.
    pub domain_theory_object: TheoryObject<T>,
    /// The portion "Y" in the above.
    pub codomain_object_type: ObjectType<T>,
    /// The object of the theory over which "Y" lies, None for holes.
    pub codomain_theory_object: TheoryObject<T>,
    /// The portion "P" in the above. An unconstrained "P" is the singleton
    /// [TheoryProArrow::Hole]; this composite is never empty.
    pub pro_arrow: Composite<TheoryProArrow<T>>,
}

// A derived `Clone` would impose a spurious `T: Clone` bound, so we implement
// it by hand.
impl<T: Theory> Clone for ProTermJudgement<T> {
    fn clone(&self) -> Self {
        ProTermJudgement {
            domain_object_term: self.domain_object_term.clone(),
            domain_object_type: self.domain_object_type.clone(),
            domain_theory_object: self.domain_theory_object.clone(),
            codomain_object_type: self.codomain_object_type.clone(),
            codomain_theory_object: self.codomain_theory_object.clone(),
            pro_arrow: self.pro_arrow.clone(),
        }
    }
}

#[derive(Display)]
#[display("{judgement}")]
/// A pro-term together with the judgement it witnesses.
pub struct Derivation<T: Theory> {
    /// The pro-term.
    pub pro_term: ProTerm<T>,
    /// The judgement it witnesses.
    pub judgement: ProTermJudgement<T>,
}

#[derive(Display)]
#[display("TODO ~ {derivation}")]
/// A context entry recording a definition: a derivation together with the
/// surface body it was elaborated from.
pub struct DefinitionEntry<T: Theory> {
    /// The derivation.
    pub derivation: Derivation<T>,
    /// The surface body of the definition.
    pub body: Expression,
}

#[derive(Display)]
#[display("TODO ~ {} == {}", lhs.judgement, rhs.judgement)]
/// A context entry recording a relation: two derivations over a common
/// judgement.
pub struct RelationEntry<T: Theory> {
    /// One of the related derivations.
    pub lhs: Derivation<T>,
    /// The other related derivation.
    pub rhs: Derivation<T>,
}

/// A context in which type checking for a single model occurs.
pub struct ModelEntry<T: Theory> {
    /// The well-formed object generators of the model.
    pub object_generators: HashMap<String, ObjectEntry<T>>,
    /// The well-formed pro-arrow generators of the model.
    pub pro_arrow_generators: HashMap<String, GeneratingProArrowEntry<T>>,
    /// The well-formed definitions in the model.
    pub definitions: HashMap<String, DefinitionEntry<T>>,
    /// The well-formed relations in the model.
    pub relations: HashMap<String, RelationEntry<T>>,
    // TODO: use
}

impl<T: Theory> std::fmt::Display for ModelEntry<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> Result<(), std::fmt::Error> {
        let inner = format!(
            r#"
theory ~> {}
object_generators ~> {}
pro_arrow_generators ~> {}
definitions ~> {}
relations ~> {}
"#,
            T::name(),
            DHMap(&self.object_generators),
            DHMap(&self.pro_arrow_generators),
            DHMap(&self.definitions),
            DHMap(&self.relations)
        );
        write!(f, "ModelEntry{{{}}}", indent(&inner, "  "))
    }
}

impl<T: Theory> ModelEntry<T> {
    /// Construct an empty model context, ready to accumulate checked
    /// declarations for a model over the theory `T`.
    pub fn new() -> Self {
        ModelEntry {
            object_generators: HashMap::new(),
            pro_arrow_generators: HashMap::new(),
            definitions: HashMap::new(),
            relations: HashMap::new(),
        }
    }
}

impl<T: Theory> Default for ModelEntry<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T: Theory> ModelEntry<T> {
    pub fn lookup_generating_object(&self, name: &String) -> Result<&ObjectEntry<T>, EContext> {
        self.object_generators
            .get(name)
            .map_or(Err(EContext::Unbound(name.clone())), Ok)
    }
}

impl<T: Theory> ModelEntry<T> {
    pub fn add_object_type(
        &mut self,
        name: String,
        generator: ObjectEntry<T>,
    ) -> Result<(), EContext> {
        if self.object_generators.contains_key(&name) {
            return Err(EContext::Redecleration(name));
        };
        self.object_generators.insert(name, generator);
        Ok(())
    }

    pub fn add_pro_arrow(
        &mut self,
        name: String,
        generator: GeneratingProArrowEntry<T>,
    ) -> Result<(), EContext> {
        if self.pro_arrow_generators.contains_key(&name) {
            return Err(EContext::Redecleration(name));
        };
        self.pro_arrow_generators.insert(name, generator);
        Ok(())
    }

    pub fn add_definition(
        &mut self,
        name: String,
        entry: DefinitionEntry<T>,
    ) -> Result<(), EContext> {
        if self.definitions.contains_key(&name) {
            return Err(EContext::Redecleration(name));
        }
        self.definitions.insert(name, entry);
        Ok(())
    }

    pub fn add_relation(&mut self, name: String, entry: RelationEntry<T>) -> Result<(), EContext> {
        if self.relations.contains_key(&name) {
            return Err(EContext::Redecleration(name));
        }
        self.relations.insert(name, entry);
        Ok(())
    }

    pub fn lookup_generating_pro_arrow_entry(
        &self,
        name: &String,
    ) -> Result<&GeneratingProArrowEntry<T>, EContext> {
        self.pro_arrow_generators
            .get(name)
            .map_or(Err(EContext::Unbound(name.clone())), Ok)
    }

    pub fn lookup_definition(&self, name: &String) -> Option<&DefinitionEntry<T>> {
        self.definitions.get(name)
    }
}
