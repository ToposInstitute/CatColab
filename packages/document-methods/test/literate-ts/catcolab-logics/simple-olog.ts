import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { defineShape } from "catcolab-documents";

import { ThCategory } from "catlog-wasm";

export const Type = { tag: "Basic", content: "Object" } as const;
export const Aspect = { tag: "Hom", content: { tag: "Basic", content: "Object" } } as const;

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
