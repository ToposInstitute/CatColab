import { uuidv7 } from "uuidv7";

import { DblModel } from "catlog-wasm";
import type { DblTheory, MorDecl, MorType, ObDecl, ObType } from "catlog-wasm";
import { deepCopyJSON } from "../util/deepcopy";

/** A judgment in the definition of a model.

TODO: Judgments should be declarations *or* morphism equations.
 */
export type ModelJudgment = ModelDecl;

/** A declaration in the definition of a model. */
export type ModelDecl = ObjectDecl | MorphismDecl;

/** Declaration of an object in a model. */
export type ObjectDecl = ObDecl & {
    tag: "object";

    /** Human-readable name of object. */
    name: string;
};

/** Create a new object declaration with the given object type. */
export const newObjectDecl = (obType: ObType): ObjectDecl => ({
    tag: "object",
    id: uuidv7(),
    name: "",
    obType,
});

/** Declaration of a morphim in a model. */
export type MorphismDecl = MorDecl & {
    tag: "morphism";

    /** Human-readable name of morphism. */
    name: string;
};

/** Create a new morphism declaration with the given morphism type. */
export const newMorphismDecl = (morType: MorType): MorphismDecl => ({
    tag: "morphism",
    id: uuidv7(),
    name: "",
    morType,
    dom: null,
    cod: null,
});

/** Duplicate a model judgment, creating a fresh UUID when applicable. */
export const duplicateModelJudgment = (jgmt: ModelJudgment): ModelJudgment => ({
    ...deepCopyJSON(jgmt),
    id: uuidv7(),
});

/** Construct a model in `catlog` from a sequence of judgments. */
export function toCatlogModel(theory: DblTheory, judgments: Array<ModelJudgment>): DblModel {
    const model = new DblModel(theory);
    for (const judgment of judgments) {
        if (judgment.tag === "object") {
            model.addOb(judgment);
        } else if (judgment.tag === "morphism") {
            model.addMor(judgment);
        }
    }
    return model;
}
