import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Variable = defineObject({ tag: "Basic", content: "Object" });

export const PositiveLink = defineMorphism({ tag: "Hom", content: Variable.obType });

export const NegativeLink = defineMorphism(
    { tag: "Basic", content: "Negative" },
    { domain: Variable, codomain: Variable },
);

export const CausalLoop = defineShape({
    theory: "causal-loop",
    getCoreTheory: async () => {
        const { ThSignedCategory } = await import("catlog-wasm");
        return new ThSignedCategory().theory();
    },
    objects: { Variable },
    morphisms: { PositiveLink, NegativeLink },
    informal: { RichText },
});
