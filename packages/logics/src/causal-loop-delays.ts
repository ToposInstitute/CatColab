import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Variable = defineObject({ tag: "Basic", content: "Object" });

export const PositiveLink = defineMorphism({ tag: "Hom", content: Variable.obType });

export const NegativeLink = defineMorphism(
    { tag: "Basic", content: "Negative" },
    { domain: Variable.obType, codomain: Variable.obType },
);

export const DelayedPositiveLink = defineMorphism(
    { tag: "Basic", content: "PositiveSlow" },
    { domain: Variable.obType, codomain: Variable.obType },
);

export const DelayedNegativeLink = defineMorphism(
    { tag: "Basic", content: "NegativeSlow" },
    { domain: Variable.obType, codomain: Variable.obType },
);

export const CausalLoopDelays = defineShape({
    theory: "causal-loop-delays",
    getCoreTheory: async () => {
        const { ThDelayableSignedCategory } = await import("catlog-wasm");
        return new ThDelayableSignedCategory().theory();
    },
    objects: { Variable },
    morphisms: { PositiveLink, NegativeLink, DelayedPositiveLink, DelayedNegativeLink },
    informal: { RichText },
});
