import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const FormType = defineObject({ tag: "Basic", content: "Object" });

export const Operator = defineMorphism(
    { tag: "Basic", content: "Nonscalar" },
    { domain: FormType.obType, codomain: FormType.obType },
);

export const Scalar = defineMorphism({ tag: "Hom", content: FormType.obType });

export const UnaryDEC = defineShape({
    theory: "unary-dec",
    getCoreTheory: async () => {
        const { ThCategoryWithScalars } = await import("catlog-wasm");
        return new ThCategoryWithScalars().theory();
    },
    objects: { FormType },
    morphisms: { Operator, Scalar },
    informal: { RichText },
    supportsEquations: true,
});
