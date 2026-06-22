import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { defineShape } from "catcolab-documents";

import { ThSymMonoidalCategory } from "catlog-wasm";

// Object and morphism types are plain `ObType`/`MorType` literals, declared as
// standalone `const`s (with `as const` so their structure survives type
// inference) and listed in the shape. A transition's source and target are
// symmetric lists of places, so its morphism type is a `Hom` over a
// `SymmetricList` modality; that list modality is what drives the array-valued
// endpoints.
export const Place = { tag: "Basic", content: "Object" } as const;
export const Transition = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: Place },
    },
} as const;

export const PetriNet = defineShape({
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    objects: [Place],
    morphisms: [Transition],
});

export type PlaceCell = ObjectCell<typeof Place>;
export type TransitionCell = MorphismCell<typeof Transition>;
