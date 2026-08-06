import { MassActionDynamics, Visualization } from "catcolab-analyses";

import { defineMorphism, defineObject, defineShape } from "catcolab-documents";

export const Place = defineObject({ tag: "Basic", content: "Object" });
export const Transition = defineMorphism(
    { tag: "Hom", content: Place.obType },
    {
        domain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" },
        codomain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" },
    },
);

export const PetriNet = defineShape({
    theory: "petri-net",
    getCoreTheory: async () => {
        const { ThSymMonoidalCategory } = await import("catlog-wasm");
        return new ThSymMonoidalCategory().theory();
    },
    objects: [Place],
    morphisms: [Transition],
    modelAnalyses: [Visualization, MassActionDynamics],
});
