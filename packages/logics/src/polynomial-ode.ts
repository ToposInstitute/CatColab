import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Variable = defineObject({ tag: "Basic", content: "State" });

export const Contribution = defineMorphism(
    { tag: "Basic", content: "Contribution" },
    {
        domain: { kind: "object-list", obType: Variable.obType, modality: "SymmetricList" },
        codomain: Variable,
    },
);

export const PolynomialODE = defineShape({
    theory: "polynomial-ode",
    getCoreTheory: async () => {
        const { ThPolynomialODE } = await import("catlog-wasm");
        return new ThPolynomialODE().theory();
    },
    objects: { Variable },
    morphisms: { Contribution },
    informal: { RichText },
});
