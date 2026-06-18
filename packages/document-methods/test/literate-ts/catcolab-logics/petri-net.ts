import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { defineModelLogic } from "catcolab-documents";

import type { MorType, ObType } from "catcolab-document-types";
import { ThSymMonoidalCategory } from "catlog-wasm";

const placeObType: ObType = { tag: "Basic", content: "Object" };

// A transition's source and target are symmetric lists of places, so its
// morphism type is a `Hom` over a `SymmetricList` modality. This list modality
// is what drives the array-valued endpoints. The type must be a literal
// (declared with `satisfies MorType`, not `: MorType`) so the modality survives
// inference.
const transitionMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: placeObType },
    },
} satisfies MorType;

export const PetriNet = defineModelLogic({
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    objects: {
        Place: placeObType,
    },
    morphisms: {
        Transition: { dom: "Place", cod: "Place", morType: transitionMorType },
    },
});

export const { Place, Transition } = PetriNet.cellTypes;

export type PlaceCell = ObjectCell<typeof Place>;
export type TransitionCell = MorphismCell<typeof Transition>;
