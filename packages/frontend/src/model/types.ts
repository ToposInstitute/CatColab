import { uuidv7 } from "uuidv7";

import { DblModel } from "catlog-wasm";
import type { DblTheory, MorDecl, MorType, ObDecl, ObType } from "catlog-wasm";
import type { Notebook } from "../notebook";
import type { TheoryId } from "../theory";

/** A model of a discrete double theory in notebook form.
 */
export type ModelNotebook = {
    // User-defined name of model.
    name: string;

    // Identifier of double theory that the model is of.
    theory?: TheoryId;

    // Content of the model, formal and informal.
    notebook: Notebook<ModelJudgment>;
};

/** A judgment in the definition of a model.

TODO: Judgments can be declarations *or* morphism equations.
 */
export type ModelJudgment = ModelDecl;

export type ModelDecl = ObjectDecl | MorphismDecl;

/** Declaration of an object in a model.
 */
export type ObjectDecl = ObDecl & {
    tag: "object";

    // Human-readable name of object.
    name: string;
};

export const newObjectDecl = (type: ObType): ObjectDecl => ({
    tag: "object",
    id: uuidv7(),
    name: "",
    obType: type,
});

/** Declaration of a morphim in a model.
 */
export type MorphismDecl = MorDecl & {
    tag: "morphism";

    // Human-readable name of morphism.
    name: string;
};

export const newMorphismDecl = (type: MorType): MorphismDecl => ({
    tag: "morphism",
    id: uuidv7(),
    name: "",
    morType: type,
    dom: null,
    cod: null,
});

/** Construct a `catlog` model from a sequence of model judgments.
 */
export function catlogModel(theory: DblTheory, judgments: Array<ModelJudgment>): DblModel {
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
