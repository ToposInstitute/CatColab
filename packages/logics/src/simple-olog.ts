import { Visualization } from "catcolab-analyses";

import { defineMorphism, defineObject, defineShape, RichText } from "catcolab-documents";

export const Type = defineObject({ tag: "Basic", content: "Object" });
export const Aspect = defineMorphism({
    tag: "Hom",
    content: { tag: "Basic", content: "Object" },
});

export const SimpleOlog = defineShape({
    theory: "simple-olog",
    getCoreTheory: async () => {
        const { ThCategory } = await import("catlog-wasm");
        return new ThCategory().theory();
    },
    objects: [Type],
    morphisms: [Aspect],
    supportsEquations: true,
    supportsInstances: {
        tableObjects: [Type],
    },
    modelAnalyses: [Visualization],
    informal: [RichText],
    migrations: [
        {
            target: "simple-schema",
            migrate: async (model, targetTheory) => {
                const { ThCategory } = await import("catlog-wasm");
                return ThCategory.toSchema(model, targetTheory);
            },
        },
    ],
});
