import type {
    ModelLogic,
    MorphismType,
    ObjectCell,
    ObjectType,
} from "catcolab-document-methods/future";
import { morphismType, objectType } from "catcolab-document-methods/future";

type SimpleOlogType = ObjectType<"Type">;
type SimpleOlogAspect = MorphismType<
    ObjectCell<SimpleOlogType>,
    ObjectCell<SimpleOlogType>,
    "Aspect"
>;

export const SimpleOlog = {
    theory: "simple-olog",
    objectTypes: {
        Type: objectType<"Type">("Type"),
    },
    morphismTypes: {
        Aspect: morphismType<ObjectCell<SimpleOlogType>, ObjectCell<SimpleOlogType>, "Aspect">(),
    },
} satisfies ModelLogic<"simple-olog", { Type: SimpleOlogType }, { Aspect: SimpleOlogAspect }>;

type PetriNetPlace = ObjectType<"Place">;
type PetriNetTransition = MorphismType<
    ObjectCell<PetriNetPlace>[],
    ObjectCell<PetriNetPlace>[],
    "Transition"
>;

export const PetriNet = {
    theory: "petri-net",
    objectTypes: {
        Place: objectType<"Place">("Place"),
    },
    morphismTypes: {
        Transition: morphismType<
            ObjectCell<PetriNetPlace>[],
            ObjectCell<PetriNetPlace>[],
            "Transition"
        >(),
    },
} satisfies ModelLogic<"petri-net", { Place: PetriNetPlace }, { Transition: PetriNetTransition }>;

type SchemaEntity = ObjectType<"Entity">;
type SchemaAttrType = ObjectType<"AttrType">;
type SchemaMapping = MorphismType<ObjectCell<SchemaEntity>, ObjectCell<SchemaEntity>, "Mapping">;
type SchemaAttr = MorphismType<ObjectCell<SchemaEntity>, ObjectCell<SchemaAttrType>, "Attr">;

export const SimpleSchema = {
    theory: "simple-schema",
    objectTypes: {
        Entity: objectType<"Entity">("Entity"),
        AttrType: objectType<"AttrType">("AttrType"),
    },
    morphismTypes: {
        Mapping: morphismType<ObjectCell<SchemaEntity>, ObjectCell<SchemaEntity>, "Mapping">(),
        Attr: morphismType<ObjectCell<SchemaEntity>, ObjectCell<SchemaAttrType>, "Attr">(),
    },
} satisfies ModelLogic<
    "simple-schema",
    { Entity: SchemaEntity; AttrType: SchemaAttrType },
    { Mapping: SchemaMapping; Attr: SchemaAttr }
>;
