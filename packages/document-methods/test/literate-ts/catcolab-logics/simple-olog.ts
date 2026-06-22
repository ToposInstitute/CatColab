import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { defineMorphism, defineObject, defineShape } from "catcolab-documents";

import { ThCategory } from "catlog-wasm";

export const Type = defineObject({ tag: "Basic", content: "Object" });
export const Aspect = defineMorphism({
    tag: "Hom",
    content: { tag: "Basic", content: "Object" },
});

export const SimpleOlog = defineShape({
    theory: "simple-olog",
    coreTheory: new ThCategory().theory(),
    objects: [Type],
    morphisms: [Aspect],
    migrations: [
        {
            target: "simple-schema",
            migrate: ThCategory.toSchema,
        },
    ],
});

export type TypeCell = ObjectCell<typeof Type>;
export type AspectCell = MorphismCell<typeof Aspect>;
