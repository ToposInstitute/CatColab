use derive_more::Display;
use textwrap::indent;

use std::collections::HashMap;

use crate::mtt::{
    checker::{
        ModelGeneratingProArrow,
        core_types::{ObjectTerm, ObjectType, ProTerm, TheoryGeneratingProArrow, TheoryObject},
        error::EContext,
    },
    composite::Composite,
    display_helpers::DHMap,
    theory::Theory,
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
#[display("{over}({dom} -|-> {cod})")]
/// A context entry recording a well-founded generating pro-arrow in the model.
/// We store these entries indexed by their name, so there is no further data
/// beyond those fields below. Explicit in this particular arrangement of data
/// is the notion that a generating pro-arrow for the model may only live over a
/// generating pro-arrow for the theory. In the future we may wish to lift this
/// restriction.
pub struct GeneratingProArrowEntry<T: Theory> {
    /// The domain object type.
    pub dom: ObjectEntry<T>,
    /// The codomain object type.
    pub cod: ObjectEntry<T>,
    /// The theory pro-arrow over which this object lives.
    pub over: String,
}

#[derive(Display)]
#[display(
    "{domain_object_term}: {domain_object_type}/{domain_theory_object} ⊢_{{{}}} {codomain_object_term}: {codomain_object_type}/{codomain_theory_object}",
    pro_arrow.as_ref().map(|p| p.to_string()).unwrap_or("_".to_string()),

)]
/// The data of a judgement of a pro-term, which may be computed from an
/// abitrary derivation of a pro-term in context. In what follows we will refer
/// to "Γ | x : X ⊢_P y : Y"
pub struct ProTermJudgement<T: Theory> {
    /// The portion "x" in the above.
    pub domain_object_term: ObjectTerm<T>,
    /// The portion "X" in the above.
    pub domain_object_type: ObjectType<T>,
    /// The object of the theory over which "X" lies, None for holes.
    pub domain_theory_object: TheoryObject<T>,
    /// The portion "y" in the above.
    pub codomain_object_term: ObjectTerm<T>,
    /// The portion "Y" in the above.
    pub codomain_object_type: ObjectType<T>,
    /// The object of the theory over which "Y" lies, None for holes.
    pub codomain_theory_object: TheoryObject<T>,
    /// The portion "P" in the above, None for holes.
    pub pro_arrow: Option<Composite<TheoryGeneratingProArrow<T>>>,
}

#[derive(Display)]
#[display("TODO ~ {judgement}")]
/// A context entry recording a well-founded derived pro-term in the model. As
/// derivations may not be unique, it behooves us to store these alongside the
/// judgement data.
pub struct DefinitionEntry<T: Theory> {
    /// The pro-term derivation itself.
    pub pro_term: ProTerm<T>,
    /// The data of the judgement of the pro-term.
    pub judgement: ProTermJudgement<T>,
}

#[derive(Display)]
#[display("TODO ~ {judgement}")]
/// A context entry recording a well-founded relation in the model. The two
/// derivations of pro-terms share the same judgement data.
pub struct RelationEntry<T: Theory> {
    /// One of the derivations of a pro-term, subject of the relation.
    pub lhs_pro_term: ProTerm<T>,
    /// The other of the derivations of a pro-term, subject of the relation.
    pub rhs_pro_term: ProTerm<T>,
    /// The data of the judgement, necessarily the same for both derivations. In
    /// greater detail, because we are declaring these two pro-term derivations,
    /// the "y : Y" data of the judgement is a "representative" of this equality
    /// class and so in a sense it does not matter which judgement we store.
    pub judgement: ProTermJudgement<T>,
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

    pub fn lookup_generating_pro_arrow(&self, name: &String) -> Option<ModelGeneratingProArrow<T>> {
        self.pro_arrow_generators
            .get(name)
            .map(|GeneratingProArrowEntry { dom, cod, .. }| {
                ModelGeneratingProArrow::from(
                    name.clone(),
                    dom.object_type.clone(),
                    cod.object_type.clone(),
                )
            })
    }
}
