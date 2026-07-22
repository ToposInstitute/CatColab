import type { Shape } from "catcolab-documents";

export const Type = {
    kind: "object",
    obType: { tag: "Basic", content: "Object" },
} as const;

export const Aspect = {
    kind: "morphism",
    morType: { tag: "Hom", content: Type.obType },
} as const;

export const SimpleOlog = {
    theory: "simple-olog",
    objects: [Type],
    morphisms: [Aspect],
} as const satisfies Shape;
