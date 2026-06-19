import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { basicMorphism, defineShape } from "catcolab-documents";

import { ThSchema } from "catlog-wasm";

const entityObType = { tag: "Basic", content: "Entity" } as const;
const attrTypeObType = { tag: "Basic", content: "AttrType" } as const;

const mappingMorType = { tag: "Hom", content: { tag: "Basic", content: "Entity" } } as const;

export const SimpleSchema = defineShape({
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    objects: {
        Entity: entityObType,
        AttrType: attrTypeObType,
    },
    morphisms: {
        Mapping: mappingMorType,
        // `Attr` is a Basic morphism: its endpoints are not in the MorType
        // literal, so they are declared explicitly (Entity -> AttrType).
        Attr: basicMorphism("Attr", entityObType, attrTypeObType),
    },
});

export const { Entity, AttrType } = SimpleSchema.objects;
export const { Mapping, Attr } = SimpleSchema.morphisms;

export type EntityCell = ObjectCell<typeof Entity>;
export type AttrTypeCell = ObjectCell<typeof AttrType>;
export type MappingCell = MorphismCell<typeof Mapping>;
export type AttrCell = MorphismCell<typeof Attr>;
