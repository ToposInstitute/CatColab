import type {
    ModelLogic,
    MorphismType,
    ObjectCell,
    ObjectType,
} from "catcolab-document-methods/future";
import { morphismType, objectType } from "catcolab-document-methods/future";

type TypeType = ObjectType<"Type">;
type AspectType = MorphismType<ObjectCell<TypeType>, ObjectCell<TypeType>, "Aspect">;

export const Type: TypeType = objectType<"Type">("Type");
export const Aspect: AspectType = morphismType<
    ObjectCell<TypeType>,
    ObjectCell<TypeType>,
    "Aspect"
>();

export const SimpleOlog = {
    theory: "simple-olog",
    cellTypes: { Type, Aspect },
} satisfies ModelLogic<"simple-olog", { Type: TypeType; Aspect: AspectType }>;
