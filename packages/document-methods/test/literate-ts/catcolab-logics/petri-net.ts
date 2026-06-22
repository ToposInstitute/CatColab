import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { defineMorphism, defineObject, defineShape } from "catcolab-documents";

import { ThSymMonoidalCategory } from "catlog-wasm";

export const Place = defineObject({ tag: "Basic", content: "Object" });
export const Transition = defineMorphism({
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: Place.obType },
    },
});

export const PetriNet = defineShape({
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    objects: [Place],
    morphisms: [Transition],
});

export type PlaceCell = ObjectCell<typeof Place>;
export type TransitionCell = MorphismCell<typeof Transition>;
