import type {
    ModelLogic,
    MorphismType,
    ObjectCell,
    ObjectType,
} from "catcolab-binder";
import { morphismType, objectType } from "catcolab-binder";

type PlaceType = ObjectType<"Place">;
type TransitionType = MorphismType<ObjectCell<PlaceType>[], ObjectCell<PlaceType>[], "Transition">;

export const Place: PlaceType = objectType<"Place">("Place");
export const Transition: TransitionType = morphismType<
    ObjectCell<PlaceType>[],
    ObjectCell<PlaceType>[],
    "Transition"
>();

export const PetriNet = {
    theory: "petri-net",
    cellTypes: { Place, Transition },
} satisfies ModelLogic<"petri-net", { Place: PlaceType; Transition: TransitionType }>;
