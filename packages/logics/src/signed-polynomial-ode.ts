import { defineShape, RichText, defineObject, defineMorphism } from "catcolab-documents";

export const Variable = defineObject({ tag: "Basic", content: "State" });

export const PositiveContribution = defineMorphism(
    { tag: "Basic", content: "Contribution" },
    {
        domain: { kind: "object-list", obType: Variable.obType, modality: "SymmetricList" },
        codomain: Variable,
    },
);

export const NegativeContribution = defineMorphism(
    { tag: "Basic", content: "NegativeContribution" },
    {
        domain: { kind: "object-list", obType: Variable.obType, modality: "SymmetricList" },
        codomain: Variable,
    },
);

export const SignedPolynomialODE = defineShape({
    theory: "signed-polynomial-ode",
    getCoreTheory: async () => {
        const { ThSignedPolynomialODE } = await import("catlog-wasm");
        return new ThSignedPolynomialODE().theory();
    },
    objects: { Variable },
    morphisms: { PositiveContribution, NegativeContribution },
    informal: { RichText },
});
