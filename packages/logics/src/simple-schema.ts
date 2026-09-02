import {
    defineMorphism,
    defineObject,
    defineShape,
    PathEquation,
    RichText,
} from "catcolab-documents";

export const Entity = defineObject({ tag: "Basic", content: "Entity" });
export const AttrType = defineObject({ tag: "Basic", content: "AttrType" });

export const Mapping = defineMorphism({ tag: "Hom", content: Entity.obType });
export const Attr = defineMorphism(
    { tag: "Basic", content: "Attr" },
    { domain: Entity.obType, codomain: AttrType.obType },
);

export const SimpleSchema = defineShape({
    theory: "simple-schema",
    getCoreTheory: async () => {
        const { ThSchema } = await import("catlog-wasm");
        return new ThSchema().theory();
    },
    objects: [Entity, AttrType],
    morphisms: [Mapping, Attr],
    informal: [RichText],
    supportsEquations: true,
    supportsInstances: {
        tableObjects: [Entity],
    },
});

export const simpleSchemaCellTypes = {
    Entity,
    AttrType,
    Mapping,
    Attr,
    RichText,
    PathEquation,
};
