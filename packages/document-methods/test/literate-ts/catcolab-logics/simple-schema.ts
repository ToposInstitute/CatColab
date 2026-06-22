import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { basicMorphism, defineShape } from "catcolab-documents";

import { ThSchema } from "catlog-wasm";

export const Entity = { tag: "Basic", content: "Entity" } as const;
export const AttrType = { tag: "Basic", content: "AttrType" } as const;

export const Mapping = { tag: "Hom", content: Entity } as const;
// `Attr` is a Basic morphism: its endpoints are not in the MorType literal, so
// they are declared explicitly (Entity -> AttrType).
export const Attr = basicMorphism("Attr", Entity, AttrType);

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
