import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Variable = defineObject({ tag: "Basic", content: "Object" });

export const PositiveLink = defineMorphism({ tag: "Hom", content: Variable.obType });

export const NegativeLink = defineMorphism(
    { tag: "Basic", content: "Negative" },
    { domain: Variable, codomain: Variable },
);

export const GradedCausalLoop = defineShape({
    theory: "graded-causal-loop",
    getCoreTheory: async () => {
        const { ThSignedCategoryWithDegrees } = await import("catlog-wasm");
        return new ThSignedCategoryWithDegrees().theory();
    },
    objects: { Variable },
    morphisms: { PositiveLink, NegativeLink },
    informal: { RichText },
});
