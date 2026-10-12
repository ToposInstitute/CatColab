import { defineMorphism, defineObject, defineShape, PathEquation } from "catcolab-documents";

export const Type = defineObject({ tag: "Basic", content: "Object" });

export const Aspect = defineMorphism({ tag: "Hom", content: Type.obType });

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
});

export const simpleOlogCellTypes = {
    Type,
    Aspect,
    PathEquation,
};
