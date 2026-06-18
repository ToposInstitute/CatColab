import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { defineModelLogic } from "catcolab-documents";

import type { MorType, ObType } from "catcolab-document-types";
import { ThSchema } from "catlog-wasm";

const entityObType: ObType = { tag: "Basic", content: "Entity" };
const attrTypeObType: ObType = { tag: "Basic", content: "AttrType" };

const mappingMorType: MorType = { tag: "Hom", content: { tag: "Basic", content: "Entity" } };
const attrMorType: MorType = { tag: "Basic", content: "Attr" };

export const SimpleSchema = defineModelLogic({
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    objects: {
        Entity: entityObType,
        AttrType: attrTypeObType,
    },
    morphisms: {
        Mapping: { dom: "Entity", cod: "Entity", morType: mappingMorType },
        Attr: { dom: "Entity", cod: "AttrType", morType: attrMorType },
    },
});

export const { Entity, AttrType, Mapping, Attr } = SimpleSchema.cellTypes;

export type EntityCell = ObjectCell<typeof Entity>;
export type AttrTypeCell = ObjectCell<typeof AttrType>;
export type MappingCell = MorphismCell<typeof Mapping>;
export type AttrCell = MorphismCell<typeof Attr>;
