import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { defineMorphism, defineObject, defineShape } from "catcolab-documents";

import { ThSchema } from "catlog-wasm";

export const Entity = defineObject({ tag: "Basic", content: "Entity" });
export const AttrType = defineObject({ tag: "Basic", content: "AttrType" });

export const Mapping = defineMorphism({ tag: "Hom", content: Entity.obType });
// `Attr` is a Basic morphism: its endpoints are not in the MorType literal, so
// they are declared explicitly (Entity -> AttrType).
export const Attr = defineMorphism(
    { tag: "Basic", content: "Attr" },
    { domObType: Entity.obType, codObType: AttrType.obType },
);

export const SimpleSchema = defineShape({
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    objects: [Entity, AttrType],
    morphisms: [Mapping, Attr],
});

export type EntityCell = ObjectCell<typeof Entity>;
export type AttrTypeCell = ObjectCell<typeof AttrType>;
export type MappingCell = MorphismCell<typeof Mapping>;
export type AttrCell = MorphismCell<typeof Attr>;
