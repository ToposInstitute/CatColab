import type {
    ModelLogic,
    MorphismCell,
    MorphismType,
    ObjectCell,
    ObjectType,
} from "catcolab-documents";
import { morphismType, objectType } from "catcolab-documents";

import { ThSymMonoidalCategory } from "catlog-wasm";

type PlaceType = ObjectType<"Place">;
type TransitionType = MorphismType<ObjectCell<PlaceType>[], ObjectCell<PlaceType>[], "Transition">;

export const Place: PlaceType = objectType<"Place">("Object");
export const Transition: TransitionType = morphismType<
    ObjectCell<PlaceType>[],
    ObjectCell<PlaceType>[],
    "Transition"
>();

export type PlaceCell = ObjectCell<PlaceType>;
export type TransitionCell = MorphismCell<TransitionType>;

export const PetriNet = {
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    cellTypes: { Place, Transition },
} satisfies ModelLogic<"petri-net", { Place: PlaceType; Transition: TransitionType }>;
