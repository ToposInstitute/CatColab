import { Simulation } from "catcolab-analyses";
import type { AnalysisCell, MorphismCell, ObjectCell } from "catcolab-documents";
import { defineMorphism, defineObject, defineShape } from "catcolab-documents";

import { ThSymMonoidalCategory } from "catlog-wasm";

export const Place = defineObject({ tag: "Basic", content: "Object" });
export const Transition = defineMorphism(
    { tag: "Hom", content: Place.obType },
    {
        domain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" },
        codomain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" },
    },
);

export const PetriNet = defineShape({
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    objects: [Place],
    morphisms: [Transition],
    modelAnalyses: [Simulation],
});

export type PlaceCell = ObjectCell<typeof Place>;
export type TransitionCell = MorphismCell<typeof Transition>;
export type SimulationCell = AnalysisCell<typeof Simulation>;
