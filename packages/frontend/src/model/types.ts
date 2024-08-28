import type { Component } from "solid-js";
import { uuidv7 } from "uuidv7";

import { DblModel } from "catlog-wasm";
import type { DblTheory, MorDecl, MorType, ObDecl, ObType } from "catlog-wasm";
import type { Notebook } from "../notebook";
import type { Theory, TheoryId } from "../theory";

/** A model of a double theory in the form of notebook.
 */
export type ModelNotebook = {
    /** User-defined name of model. */
    name: string;

    /** Identifier of double theory that the model is of. */
    theory?: TheoryId;

    /** Content of the model, formal and informal. */
    notebook: Notebook<ModelJudgment>;

    /** Views onto the model, a separate notebook. */
    views?: Notebook<ModelView<unknown>>;
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

/** View onto a model of a theory.

Such a view could be a visualization, a simulation, or a translation of the
model into another format. Views onto a model can have their own content or
state beyond the data of the model.
 */
export type ModelView<T> = {
    /** Identifier of view, unique relative to the theory. */
    tag: string;

    /** Content associated with the view (not the model). */
    content: T;
};

/** Component that renders a view onto a model. */
export type ModelViewComponent<T> = Component<ModelViewProps<T>>;

/** Props passed to a view onto a model. */
export type ModelViewProps<T> = {
    /** The model being viewed. */
    model: Array<ModelJudgment>;

    /** The `catlog` representation of the model, if the model is valid. */
    validatedModel: DblModel | null;

    /** Theory that the model is of.

    Some views only apply to one theory but the theory is passed regardless.
     */
    theory: Theory;

    /** Content associated with the view itself. */
    content: T;

    /** Update content associated with the view. */
    changeContent: (f: (content: T) => void) => void;
};
