#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use uuid::Uuid;

    use crate::v0::model::Ob;
    use crate::v0::model_judgment::{ModelJudgment, MorDecl, ObDecl};
    use crate::v0::theory::{Modality, MorType, ObOp, ObType};
    use crate::v2::cell::NotebookCell;
    use crate::v2::lens::types::{FormalContentDelta, FormalContentDeltaLens};
    use crate::v2::notebook::Notebook;
    use crate::v2::petrinet::{
        PetriNetArc, PetriNetDocumentContent, PetriNetPlace, PetriNetTransition,
    };

    const S: Uuid = Uuid::from_u128(1);
    const I: Uuid = Uuid::from_u128(2);
    const INFECT: Uuid = Uuid::from_u128(3);

    fn empty_notebook() -> Notebook<ModelJudgment> {
        Notebook {
            cell_contents: HashMap::new(),
            cell_order: vec![],
        }
    }

    fn empty_petri_net() -> PetriNetDocumentContent {
        PetriNetDocumentContent {
            name: String::new(),
            places: vec![],
            transitions: vec![],
            version: "2".to_string(),
        }
    }

    #[test]
    fn petri_net_to_formal_content() {
        let pn = PetriNetDocumentContent {
            name: String::new(),
            places: vec![
                PetriNetPlace {
                    id: S,
                    name: "S".to_string(),
                    x: 0.0,
                    y: 0.0,
                },
                PetriNetPlace {
                    id: I,
                    name: "I".to_string(),
                    x: 0.0,
                    y: 0.0,
                },
            ],
            transitions: vec![PetriNetTransition {
                id: INFECT,
                name: "infect".to_string(),
                input_arcs: vec![
                    PetriNetArc { place_id: S, weight: 1 },
                    PetriNetArc { place_id: I, weight: 1 },
                ],
                output_arcs: vec![PetriNetArc { place_id: I, weight: 2 }],
                x: 0.0,
                y: 0.0,
            }],
            version: "2".to_string(),
        };

        assert_eq!(
            pn.to_formal_content(),
            vec![
                ModelJudgment::Object(ObDecl {
                    id: S,
                    name: "S".to_string(),
                    ob_type: ObType::Basic(ustr::ustr("Object")),
                }),
                ModelJudgment::Object(ObDecl {
                    id: I,
                    name: "I".to_string(),
                    ob_type: ObType::Basic(ustr::ustr("Object")),
                }),
                ModelJudgment::Morphism(MorDecl {
                    id: INFECT,
                    name: "infect".to_string(),
                    mor_type: MorType::Hom(Box::new(ObType::Basic(ustr::ustr("Object")))),
                    dom: Some(Ob::App {
                        op: ObOp::Basic(ustr::ustr("tensor")),
                        ob: Box::new(Ob::List {
                            modality: Modality::SymmetricList,
                            objects: vec![
                                Some(Ob::Basic(S.to_string())),
                                Some(Ob::Basic(I.to_string())),
                            ],
                        }),
                    }),
                    cod: Some(Ob::App {
                        op: ObOp::Basic(ustr::ustr("tensor")),
                        ob: Box::new(Ob::List {
                            modality: Modality::SymmetricList,
                            objects: vec![
                                Some(Ob::Basic(I.to_string())),
                                Some(Ob::Basic(I.to_string())),
                            ],
                        }),
                    }),
                }),
            ]
        );
    }

    #[test]
    fn notebook_round_trips_through_petri_net() {
        // this is not really SI(R), but that would be too long to elaborate
        // here.
        let nb = Notebook {
            cell_contents: HashMap::from([
                (
                    S,
                    NotebookCell::Formal {
                        id: S,
                        content: ModelJudgment::Object(ObDecl {
                            id: S,
                            name: "S".to_string(),
                            ob_type: ObType::Basic(ustr::ustr("Object")),
                        }),
                    },
                ),
                (
                    INFECT,
                    NotebookCell::Formal {
                        id: INFECT,
                        content: ModelJudgment::Morphism(MorDecl {
                            id: INFECT,
                            name: "infect".to_string(),
                            mor_type: MorType::Hom(Box::new(ObType::Basic(ustr::ustr("Object")))),
                            dom: Some(Ob::App {
                                op: ObOp::Basic(ustr::ustr("tensor")),
                                ob: Box::new(Ob::List {
                                    modality: Modality::SymmetricList,
                                    objects: vec![Some(Ob::Basic(S.to_string()))],
                                }),
                            }),
                            cod: Some(Ob::App {
                                op: ObOp::Basic(ustr::ustr("tensor")),
                                ob: Box::new(Ob::List {
                                    modality: Modality::SymmetricList,
                                    objects: vec![Some(Ob::Basic(S.to_string()))],
                                }),
                            }),
                        }),
                    },
                ),
            ]),
            cell_order: vec![S, INFECT],
        };

        let mut pn = empty_petri_net();
        pn.apply_delta(&FormalContentDelta::diff(&[], &nb.to_formal_content()));

        let mut nb2 = empty_notebook();
        nb2.apply_delta(&FormalContentDelta::diff(&[], &pn.to_formal_content()));

        assert_eq!(nb2, nb);
    }

    #[test]
    fn insert_update_remove_on_both_sides() {
        let mut pn = empty_petri_net();
        let mut nb = empty_notebook();

        // Insert S on the petri net side, propagate to notebook.
        pn.places.push(PetriNetPlace {
            id: S,
            name: "S".to_string(),
            x: 0.0,
            y: 0.0,
        });
        nb.apply_delta(&FormalContentDelta::diff(&[], &pn.to_formal_content()));
        let should_be = Notebook {
            cell_contents: HashMap::from([(
                Uuid::from_u128(1),
                NotebookCell::Formal {
                    id: Uuid::from_u128(1),
                    content: ModelJudgment::Object(ObDecl {
                        name: "S".to_string(),
                        id: Uuid::from_u128(1),
                        ob_type: ObType::Basic(ustr::ustr("Object")),
                    }),
                },
            )]),
            cell_order: vec![Uuid::from_u128(1)],
        };
        assert_eq!(nb, should_be);

        // Update S on the notebook side, propagate to petri net.
        let cell_id = *nb.cell_order.first().unwrap();
        nb.cell_contents.insert(
            cell_id,
            NotebookCell::Formal {
                id: cell_id,
                content: ModelJudgment::Object(ObDecl {
                    id: S,
                    name: "S_renamed".to_string(),
                    ob_type: ObType::Basic(ustr::ustr("Object")),
                }),
            },
        );
        let pn_before = pn.to_formal_content();
        pn.apply_delta(&FormalContentDelta::diff(&pn_before, &nb.to_formal_content()));
        let should_be = PetriNetDocumentContent {
            name: String::new(),
            places: vec![PetriNetPlace {
                id: Uuid::from_u128(1),
                name: "S_renamed".to_string(),
                x: 0.0,
                y: 0.0,
            }],
            transitions: Vec::new(),
            version: "2".to_string(),
        };
        assert_eq!(pn, should_be);

        // Remove S on the petri net side, propagate to notebook.
        let pn_before = pn.to_formal_content();
        pn.places.clear();
        nb.apply_delta(&FormalContentDelta::diff(&pn_before, &pn.to_formal_content()));
        let should_be = empty_notebook();
        assert_eq!(nb, should_be);
    }
}
