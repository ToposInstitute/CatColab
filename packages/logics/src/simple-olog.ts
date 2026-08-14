import { defineMorphism, defineObject, defineShape } from "catcolab-documents";

export const Type = defineObject({ tag: "Basic", content: "Object" });

export const Aspect = defineMorphism({ tag: "Hom", content: Type.obType });

export const SimpleOlog = defineShape({
    theory: "simple-olog",
    objects: [Type],
    morphisms: [Aspect],
});
