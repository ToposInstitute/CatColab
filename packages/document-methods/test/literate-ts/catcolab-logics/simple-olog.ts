import type { MorphismCell, ObjectCell } from "catcolab-documents";
import { defineModelLogic } from "catcolab-documents";

import type { MorType, ObType } from "catcolab-document-types";
import { ThCategory } from "catlog-wasm";

const typeObType: ObType = { tag: "Basic", content: "Object" };
const aspectMorType: MorType = { tag: "Hom", content: { tag: "Basic", content: "Object" } };

export const SimpleOlog = defineModelLogic({
    theory: "simple-olog",
    coreTheory: new ThCategory().theory(),
    objects: {
        Type: typeObType,
    },
    morphisms: {
        Aspect: { dom: "Type", cod: "Type", morType: aspectMorType },
    },
    migrations: [
        {
            target: "simple-schema",
            migrate: ThCategory.toSchema,
        },
    ],
});

export const { Type, Aspect } = SimpleOlog.cellTypes;

export type TypeCell = ObjectCell<typeof Type>;
export type AspectCell = MorphismCell<typeof Aspect>;
