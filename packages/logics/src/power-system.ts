import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Bus = defineObject({ tag: "Basic", content: "Bus" });

export const Line = defineMorphism({ tag: "Hom", content: Bus.obType });

export const Transformer = defineMorphism(
    { tag: "Basic", content: "Passive" },
    { domain: Bus, codomain: Bus },
);

export const Link = defineMorphism(
    { tag: "Basic", content: "Branch" },
    { domain: Bus, codomain: Bus },
);

export const PowerSystem = defineShape({
    theory: "power-system",
    getCoreTheory: async () => {
        const { ThPowerSystem } = await import("catlog-wasm");
        return new ThPowerSystem().theory();
    },
    objects: { Bus },
    morphisms: { Line, Transformer, Link },
    informal: { RichText },
});
