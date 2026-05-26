use std::str::FromStr;

use uuid::Uuid;

use crate::v0::model::Ob;
use crate::v0::model_judgment::{ModelJudgment, MorDecl, ObDecl};
use crate::v0::theory::{Modality, MorType, ObOp, ObType};
use crate::v2::lens::types::{FormalContentChange, FormalContentDelta, FormalContentDeltaLens};
use crate::v2::petrinet::{
    PetriNetArc, PetriNetDocumentContent, PetriNetPlace, PetriNetTransition,
};

// We have to bake in the particulars of the theory for Petri nets here so that
// our lens code functions correctly.
fn petri_ob_type() -> ObType {
    ObType::Basic(ustr::ustr("Object"))
}

fn petri_mor_type() -> MorType {
    MorType::Hom(Box::new(petri_ob_type()))
}

// Places <> Objects
fn place_from_ob_decl(ob_decl: &ObDecl) -> PetriNetPlace {
    // WARNING! we completely ignore ob_decl.ob_type, the assumption here and
    // elsewhere is that this delta lens for a Petri net will not be paired with
    // deltas that are not interpretable into Petrin nets.
    PetriNetPlace {
        id: ob_decl.id,
        name: ob_decl.name.clone(),
        // In the future we may wish to do something more clever than defaulting
        // to (0,0) for new data
        x: 0.0,
        y: 0.0,
    }
}

fn ob_decl_from_place(place: &PetriNetPlace) -> ObDecl {
    ObDecl {
        id: place.id,
        name: place.name.clone(),
        ob_type: petri_ob_type(),
    }
}

// Transitions <> Morphisms
fn transition_from_mor_decl(mor_decl: &MorDecl) -> PetriNetTransition {
    // WARNING! we intentionally ignore mor_decl.mor_type, see the above comment
    // on place_from_obj.
    PetriNetTransition {
        id: mor_decl.id,
        name: mor_decl.name.clone(),
        input_arcs: mor_decl.dom.as_ref().map(tensor_ob_to_arcs).unwrap_or_default(),
        output_arcs: mor_decl.cod.as_ref().map(tensor_ob_to_arcs).unwrap_or_default(),
        // Likewise here, future code changes could improve this with some kind
        // of heuristic.
        x: 0.0,
        y: 0.0,
    }
}

fn mor_decl_from_transition(t: &PetriNetTransition) -> MorDecl {
    MorDecl {
        id: t.id,
        name: t.name.clone(),
        mor_type: petri_mor_type(),
        dom: Some(arcs_to_tensor_ob(&t.input_arcs)),
        cod: Some(arcs_to_tensor_ob(&t.output_arcs)),
    }
}

// Arcs <> Tensors
fn arcs_to_tensor_ob(arcs: &[PetriNetArc]) -> Ob {
    Ob::App {
        op: ObOp::Basic(ustr::ustr("tensor")),
        ob: Box::new(Ob::List {
            modality: Modality::SymmetricList,
            objects: arcs_to_repeated_ob_list(arcs),
        }),
    }
}

fn tensor_ob_to_arcs(ob: &Ob) -> Vec<PetriNetArc> {
    // WARNING! once more we make strong assumptions about the data, we are not
    // checking that the modality is the one "it should be" for the theory of
    // Petri nets and so forth.
    match ob {
        Ob::App { ob, .. } => match ob.as_ref() {
            Ob::List { objects, .. } => repeated_ob_list_to_arcs(objects),
            _ => vec![],
        },
        _ => vec![],
    }
}

fn arcs_to_repeated_ob_list(arcs: &[PetriNetArc]) -> Vec<Option<Ob>> {
    let mut objects = Vec::new();
    for arc in arcs {
        let ob_str = arc.place_id.to_string();
        // we use weight as a repetition count
        for _ in 0..arc.weight {
            objects.push(Some(Ob::Basic(ob_str.clone())));
        }
    }
    objects
}

fn repeated_ob_list_to_arcs(objects: &[Option<Ob>]) -> Vec<PetriNetArc> {
    let mut arcs: Vec<PetriNetArc> = Vec::new();
    // matching the above, here we assume that *adjacent* repetitions should
    // resolve to weight
    for ob in objects.iter().flatten() {
        let Some(place_id) = place_id_from_ob(ob) else {
            continue;
        };
        if let Some(last) = arcs.last_mut()
            && last.place_id == place_id
        {
            last.weight += 1;
        } else {
            arcs.push(PetriNetArc { place_id, weight: 1 });
        }
    }
    arcs
}

fn place_id_from_ob(ob: &Ob) -> Option<Uuid> {
    match ob {
        Ob::Basic(s) => Uuid::from_str(s).ok(),
        _ => None,
    }
}

impl FormalContentDeltaLens for PetriNetDocumentContent {
    fn to_formal_content(&self) -> Vec<ModelJudgment> {
        let places = self.places.iter().map(|p| ModelJudgment::Object(ob_decl_from_place(p)));
        let transitions = self
            .transitions
            .iter()
            .map(|t| ModelJudgment::Morphism(mor_decl_from_transition(t)));
        places.chain(transitions).collect()
    }

    fn apply_delta(&mut self, delta: &FormalContentDelta) {
        for change in delta {
            match change {
                FormalContentChange::Upsert(jgmt) => match jgmt {
                    ModelJudgment::Object(ob_decl) => {
                        if let Some(place) = self.places.iter_mut().find(|p| p.id == ob_decl.id) {
                            // the only data carried by a place that could be
                            // modified by a FormalContentDelta is the name.
                            place.name = ob_decl.name.clone();
                        } else {
                            self.places.push(place_from_ob_decl(ob_decl));
                        }
                    }
                    ModelJudgment::Morphism(mor_decl) => {
                        if let Some(t) = self.transitions.iter_mut().find(|t| t.id == mor_decl.id) {
                            t.name = mor_decl.name.clone();
                            t.input_arcs =
                                mor_decl.dom.as_ref().map(tensor_ob_to_arcs).unwrap_or_default();
                            t.output_arcs =
                                mor_decl.cod.as_ref().map(tensor_ob_to_arcs).unwrap_or_default();
                        } else {
                            self.transitions.push(transition_from_mor_decl(mor_decl));
                        }
                    }
                    // WARNING! we silently ignore everything that doesn't fit
                    // the Petri net world view. Again it is the responsibility
                    // of downstream code to ensure that we do not land up in
                    // this case.
                    _ => {}
                },
                FormalContentChange::Remove(id) => {
                    self.places.retain(|p| &p.id != id);
                    self.transitions.retain(|t| &t.id != id);
                }
            }
        }
    }
}
