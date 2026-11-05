import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Stock = defineObject({ tag: "Basic", content: "Object" });

export const Flow = defineMorphism({ tag: "Hom", content: Stock.obType });

export const Link = defineMorphism(
    { tag: "Basic", content: "Link" },
    { domain: Stock, codomain: { kind: "tabulator", morType: Flow.morType } },
);

export const PrimitiveStockFlow = defineShape({
    theory: "primitive-stock-flow",
    getCoreTheory: async () => {
        const { ThCategoryLinks } = await import("catlog-wasm");
        return new ThCategoryLinks().theory();
    },
    objects: { Stock },
    morphisms: { Flow, Link },
    informal: { RichText },
});
