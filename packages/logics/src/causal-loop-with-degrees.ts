import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Variable = defineObject({ tag: "Basic", content: "Object" });

export const PositiveLinkWithDegree = defineMorphism({
    tag: "Power",
    morType: { tag: "Basic", content: "Degree" },
    fallback: { tag: "Basic", content: Variable.obType },
});

export const NegativeLinkWithDegree = defineMorphism({
    tag: "Composite",
    content: [
        { tag: "Basic", content: "Negative" },
        {
            tag: "Power",
            morType: { tag: "Basic", content: "Degree" },
            fallback: { tag: "Basic", content: Variable.obType }
        }
    ],
    { domain: Variable, codomain: Variable },
});

export const GradedCausalLoop = defineShape({
    theory: "causal-loop-with-degrees",
    getCoreTheory: async () => {
        const { ThSignedCategoryWithDegrees } = await import("catlog-wasm");
        return new ThSignedCategoryWithDegrees().theory();
    },
    objects: { Variable },
    morphisms: { PositiveLinkWithDegree, NegativeLinkWithDegree },
    informal: { RichText },
});
