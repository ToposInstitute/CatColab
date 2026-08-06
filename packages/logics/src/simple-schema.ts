import { defineMorphism, defineObject, defineShape, RichText } from "catcolab-documents";

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
    supportsEquations: true,
    supportsInstances: {
        tableObjects: [Entity],
    },
    informal: [RichText],
    migrations: [
        {
            target: "simple-olog",
            migrate: async (model, targetTheory) => {
                const { ThSchema } = await import("catlog-wasm");
                return ThSchema.toCategory(model, targetTheory);
            },
        },
    ],
});
