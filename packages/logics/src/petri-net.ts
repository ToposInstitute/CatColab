import { defineMorphism, defineObject, defineShape, RichText } from "catcolab-documents";

export const Place = defineObject({ tag: "Basic", content: "Object" });

export const Transition = defineMorphism(
    { tag: "Hom", content: Place.obType },
    {
        domain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" },
        codomain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" }
    }
);

export const PetriNet = defineShape({
    theory: "petri-net",
    objects: [Place],
    morphisms: [Transition],
    informal: [RichText],
});
