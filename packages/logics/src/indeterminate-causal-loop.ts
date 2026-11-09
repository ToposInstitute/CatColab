import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Variable = defineObject({ tag: "Basic", content: "Object" });

export const PositiveLink = defineMorphism({ tag: "Hom", content: Variable.obType });

export const NegativeLink = defineMorphism(
    { tag: "Basic", content: "Negative" },
    { domain: Variable, codomain: Variable },
);

export const IndeterminateLink = defineMorphism(
    { tag: "Basic", content: "Zero" },
    { domain: Variable, codomain: Variable },
);

export const IndeterminateCausalLoop = defineShape({
    theory: "indeterminate-causal-loop",
    getCoreTheory: async () => {
        const { ThNullableSignedCategory } = await import("catlog-wasm");
        return new ThNullableSignedCategory().theory();
    },
    objects: { Variable },
    morphisms: { PositiveLink, NegativeLink, IndeterminateLink },
    informal: { RichText },
});
