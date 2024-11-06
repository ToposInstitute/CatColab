import { type Notebook, newNotebook } from "../notebook";
import type { TheoryId } from "../theory";
import type { ModelJudgment } from "./types";

/** A document defining a model. */
export type ModelDocument = {
    type: "model";

    /** User-defined name of model. */
    name: string;

    /** Identifier of double theory that the model is of. */
    theory?: TheoryId;

    /** Content of the model, formal and informal. */
    notebook: Notebook<ModelJudgment>;
};

/** Create an empty model document. */
export const newModelDocument = (): ModelDocument => ({
    name: "",
    type: "model",
    notebook: newNotebook(),
});
