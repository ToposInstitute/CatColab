import type {
    ModelLogic,
    MorphismType,
    ObjectCell,
    ObjectType,
} from "catcolab-document-methods/future";
import { morphismType, objectType } from "catcolab-document-methods/future";

type SimpleOlogType = ObjectType<"Type">;
type SimpleOlogAspect = MorphismType<ObjectCell<SimpleOlogType>, "Aspect">;

export const SimpleOlog = {
    theory: "simple-olog",
    objectType: objectType<"Type">("Type"),
    morphismType: morphismType<ObjectCell<SimpleOlogType>, "Aspect">(),
} satisfies ModelLogic<"simple-olog", SimpleOlogType, SimpleOlogAspect>;

type PetriNetPlace = ObjectType<"Place">;
type PetriNetTransition = MorphismType<ObjectCell<PetriNetPlace>[], "Transition">;

export const PetriNet = {
    theory: "petri-net",
    objectType: objectType<"Place">("Place"),
    morphismType: morphismType<ObjectCell<PetriNetPlace>[], "Transition">(),
} satisfies ModelLogic<"petri-net", PetriNetPlace, PetriNetTransition>;
