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
    objectTypes: {
        Type: objectType<"Type">("Type"),
    },
    morphismTypes: {
        Aspect: morphismType<ObjectCell<SimpleOlogType>, "Aspect">(),
    },
} satisfies ModelLogic<"simple-olog", { Type: SimpleOlogType }, { Aspect: SimpleOlogAspect }>;

type PetriNetPlace = ObjectType<"Place">;
type PetriNetTransition = MorphismType<ObjectCell<PetriNetPlace>[], "Transition">;

export const PetriNet = {
    theory: "petri-net",
    objectTypes: {
        Place: objectType<"Place">("Place"),
    },
    morphismTypes: {
        Transition: morphismType<ObjectCell<PetriNetPlace>[], "Transition">(),
    },
} satisfies ModelLogic<"petri-net", { Place: PetriNetPlace }, { Transition: PetriNetTransition }>;
