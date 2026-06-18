import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { defineShape } from "catcolab-documents";

import { ThSymMonoidalCategory } from "catlog-wasm";

// Object and morphism types are plain `ObType`/`MorType` literals, declared
// with `as const` so their structure survives type inference. A transition's
// source and target are symmetric lists of places, so its morphism type is a
// `Hom` over a `SymmetricList` modality; that list modality is what drives the
// array-valued endpoints.
const placeObType = { tag: "Basic", content: "Object" } as const;
const transitionMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: placeObType },
    },
} as const;

export const PetriNet = defineShape({
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    objects: {
        Place: placeObType,
    },
    morphisms: {
        Transition: transitionMorType,
    },
});

export const { Place } = PetriNet.objects;
export const { Transition } = PetriNet.morphisms;

export type PlaceCell = ObjectCell<typeof Place>;
export type TransitionCell = MorphismCell<typeof Transition>;
