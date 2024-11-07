import { uuidv7 } from "uuidv7";

import { DblModel } from "catlog-wasm";
import type {
    DblTheory,
    InvalidDiscreteDblModel,
    MorDecl,
    MorType,
    ObDecl,
    ObType,
    Uuid,
} from "catlog-wasm";
import { indexArray } from "../util/indexing";

/** A judgment in the definition of a model.

TODO: Judgments should be declarations *or* morphism equations.
 */
export type ModelJudgment = ModelDecl;

export type ModelDecl = ObjectDecl | MorphismDecl;

/** Declaration of an object in a model.
 */
export type ObjectDecl = ObDecl & {
    tag: "object";

    /** Human-readable name of object. */
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

    /** Human-readable name of morphism. */
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

/** Result of validating a model in the categorical core. */
export type ModelValidationResult =
    | ValidatedModel
    | ModelValidationErrors
    | ModelValidationNotSupported;

/** A valid model as represented in `catlog`. */
export type ValidatedModel = {
    tag: "validated";
    model: DblModel;
};

/** Errors in a model that did not validate. */
export type ModelValidationErrors = {
    tag: "errors";
    model: DblModel;
    errors: Map<Uuid, InvalidDiscreteDblModel<Uuid>[]>;
};

/** TODO: Make this variant go away because all models support validation! */
export type ModelValidationNotSupported = {
    tag: "notsupported";
};

export function validateModel(theory: DblTheory, judgments: Array<ModelJudgment>) {
    if (theory.kind !== "Discrete") {
        return { tag: "notsupported" } as ModelValidationNotSupported;
    }
    const model = catlogModel(theory, judgments);
    const errs: InvalidDiscreteDblModel<Uuid>[] = model.validate();
    if (errs.length === 0) {
        return { tag: "validated", model } as ValidatedModel;
    } else {
        return {
            tag: "errors",
            model,
            errors: indexArray(errs, (err) => err.content),
        } as ModelValidationErrors;
    }
}
