import type { ModelLogic, MorphismType, ObjectCell, ObjectType } from "catcolab-documents";
import { morphismType, objectType } from "catcolab-documents";

import { ThSchema } from "catlog-wasm";

type EntityType = ObjectType<"Entity">;
type AttrTypeType = ObjectType<"AttrType">;
type MappingType = MorphismType<ObjectCell<EntityType>, ObjectCell<EntityType>, "Mapping">;
type AttrMorphismType = MorphismType<ObjectCell<EntityType>, ObjectCell<AttrTypeType>, "Attr">;

export const Entity: EntityType = objectType<"Entity">("Entity");
export const AttrType: AttrTypeType = objectType<"AttrType">("AttrType");
export const Mapping: MappingType = morphismType<
    ObjectCell<EntityType>,
    ObjectCell<EntityType>,
    "Mapping"
>({
    tag: "Hom",
    content: { tag: "Basic", content: "Entity" },
});
export const Attr: AttrMorphismType = morphismType<
    ObjectCell<EntityType>,
    ObjectCell<AttrTypeType>,
    "Attr"
>({
    tag: "Basic",
    content: "Attr",
});

export const SimpleSchema = {
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    cellTypes: { Entity, AttrType, Mapping, Attr },
} satisfies ModelLogic<
    "simple-schema",
    {
        Entity: EntityType;
        AttrType: AttrTypeType;
        Mapping: MappingType;
        Attr: AttrMorphismType;
    }
>;
