import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Species = defineObject({ tag: "Basic", content: "Object" });

export const Promotion = defineMorphism({ tag: "Hom", content: Species.obType });

export const Inhibition = defineMorphism(
    { tag: "Basic", content: "Negative" },
    { domain: Species.obType, codomain: Species.obType },
);

export const RegNet = defineShape({
    theory: "reg-net",
    getCoreTheory: async () => {
        const { ThSignedCategory } = await import("catlog-wasm");
        return new ThSignedCategory().theory();
    },
    objects: { Species },
    morphisms: { Promotion, Inhibition },
    informal: { RichText },
});
