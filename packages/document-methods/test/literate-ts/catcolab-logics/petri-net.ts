import type {
    ModelLogic,
    MorphismCell,
    MorphismType,
    ObjectCell,
    ObjectType,
} from "catcolab-documents";
import { morphismType, objectType } from "catcolab-documents";

import type { MorType } from "catcolab-document-types";
import { ThSymMonoidalCategory } from "catlog-wasm";

type PlaceType = ObjectType<"Place">;
type TransitionType = MorphismType<ObjectCell<PlaceType>[], ObjectCell<PlaceType>[], "Transition">;

// A transition's source and target are symmetric lists of places, so its
// morphism type is a `Hom` over a `SymmetricList` modality. This list modality
// is what drives the array-valued endpoints.
const transitionMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: { tag: "Basic", content: "Object" } },
    },
} satisfies MorType;

export const Place: PlaceType = objectType<"Place">("Object");
export const Transition: TransitionType = morphismType<
    ObjectCell<PlaceType>[],
    ObjectCell<PlaceType>[],
    "Transition"
>(transitionMorType);

export type PlaceCell = ObjectCell<PlaceType>;
export type TransitionCell = MorphismCell<TransitionType>;

export const PetriNet = {
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    cellTypes: { Place, Transition },
} satisfies ModelLogic<"petri-net", { Place: PlaceType; Transition: TransitionType }>;
