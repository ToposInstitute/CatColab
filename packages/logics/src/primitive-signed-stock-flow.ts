import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Stock = defineObject({ tag: "Basic", content: "Object" });

export const Flow = defineMorphism({ tag: "Hom", content: Stock.obType });

const linkEndpoints = {
    domain: Stock,
    codomain: { kind: "tabulator", morType: Flow.morType },
} as const;

export const PositiveLink = defineMorphism({ tag: "Basic", content: "Link" }, linkEndpoints);

export const NegativeLink = defineMorphism(
    { tag: "Basic", content: "NegativeLink" },
    linkEndpoints,
);

export const PrimitiveSignedStockFlow = defineShape({
    theory: "primitive-signed-stock-flow",
    getCoreTheory: async () => {
        const { ThCategorySignedLinks } = await import("catlog-wasm");
        return new ThCategorySignedLinks().theory();
    },
    objects: { Stock },
    morphisms: { Flow, PositiveLink, NegativeLink },
    informal: { RichText },
});
