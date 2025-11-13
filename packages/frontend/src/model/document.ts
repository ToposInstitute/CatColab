import type { Accessor } from "solid-js";
import invariant from "tiny-invariant";

import { currentVersion, type DblModel, type Document, type ModelJudgment } from "catlog-wasm";
import type { Api, LiveDoc } from "../api";
import { NotebookUtils, newNotebook } from "../notebook/types";
import type { Theory, TheoryLibrary } from "../theory";
import type { ValidatedModel } from "./model_library";

/** A document defining a model. */
export type ModelDocument = Document & { type: "model" };

/** Create an empty model document. */
export const newModelDocument = (theory: string): ModelDocument => ({
    name: "",
    type: "model",
    theory,
    notebook: newNotebook<ModelJudgment>(),
    version: currentVersion(),
});

/** A model document "live" for editing.

Contains a live document for the model, plus various memos of derived data.
 */
export type LiveModelDocument = {
    /** Tag for use in tagged unions of document types. */
    type: "model";

    /** Live document with the model data. */
    liveDoc: LiveDoc<ModelDocument>;

    /** A memo of the double theory that the model is of. */
    theory: Accessor<Theory | undefined>;

    /** A memo of the model eleborated in the core, though possibly invalid. */
    elaboratedModel: Accessor<DblModel | undefined>;

    /** A memo of the model elaborated and validated in the core. */
    validatedModel: Accessor<ValidatedModel | undefined>;
};

/** Create a new model in the backend.

Returns the ref ID of the created document.
 */
export async function createModel(
    api: Api,
    initOrTheoryId: ModelDocument | string,
): Promise<string> {
    let init: ModelDocument;
    if (typeof initOrTheoryId === "string") {
        init = newModelDocument(initOrTheoryId);
    } else {
        init = initOrTheoryId;
    }
    return api.createDoc(init);
}

/** Migrate a model document from one theory to another. */
export async function migrateModelDocument(
    liveModel: LiveModelDocument,
    targetTheoryId: string,
    theories: TheoryLibrary,
) {
    const { doc, changeDoc } = liveModel.liveDoc;
    const targetTheory = await theories.get(targetTheoryId);
    const theory = liveModel.theory();
    let model = liveModel.elaboratedModel();
    invariant(theory && model); // FIXME: Should fail gracefully.

    // Trivial migration.
    if (!NotebookUtils.hasFormalCells(doc.notebook) || theory.inclusions.includes(targetTheoryId)) {
        changeDoc((doc) => {
            doc.theory = targetTheoryId;
        });
        return;
    }

    // Pushforward migration.
    const migration = theory.pushforwards.find((m) => m.target === targetTheoryId);
    if (!migration) {
        throw new Error(`No migration defined from ${theory.id} to ${targetTheoryId}`);
    }
    // TODO: We need a general method to propagate changes from catlog models to
    // notebooks. This stop-gap solution only works because pushforward
    // migration doesn't have to create/delete cells, only update types.
    model = migration.migrate(model, targetTheory.theory);
    changeDoc((doc) => {
        doc.theory = targetTheoryId;
        for (const judgment of NotebookUtils.getFormalContent(doc.notebook)) {
            if (judgment.tag === "object") {
                judgment.obType = model.obType({
                    tag: "Basic",
                    content: judgment.id,
                });
            } else if (judgment.tag === "morphism") {
                judgment.morType = model.morType({
                    tag: "Basic",
                    content: judgment.id,
                });
            }
        }
    });
}
