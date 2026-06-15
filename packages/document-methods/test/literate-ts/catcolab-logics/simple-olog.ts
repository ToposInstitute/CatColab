import type { ModelLogic, MorphismType, ObjectCell, ObjectType } from "catcolab-documents";
import { morphismType, objectType } from "catcolab-documents";

import { ThCategory } from "catlog-wasm";

type TypeType = ObjectType<"Type">;
type AspectType = MorphismType<ObjectCell<TypeType>, ObjectCell<TypeType>, "Aspect">;

export const Type: TypeType = objectType<"Type">("Object");
export const Aspect: AspectType = morphismType<
    ObjectCell<TypeType>,
    ObjectCell<TypeType>,
    "Aspect"
>();

export const SimpleOlog = {
    theory: "simple-olog",
    coreTheory: new ThCategory().theory(),
    cellTypes: { Type, Aspect },
    migrations: [
        {
            target: "simple-schema",
            migrate: ThCategory.toSchema,
        },
    ],
} satisfies ModelLogic<"simple-olog", { Type: TypeType; Aspect: AspectType }>;
