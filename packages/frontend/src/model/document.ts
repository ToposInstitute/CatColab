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
export const newModelDocument = (theory: string, editorVariant?: string): ModelDocument => ({
    name: "",
    type: "model",
    theory,
    ...(editorVariant ? { editorVariant } : {}),
    notebook: newNotebook<ModelJudgment>(),
    version: currentVersion(),
});

/** A model document "live" for editing.

Contains a live document for the model, plus various memos of derived data.
 */
export type LiveModelDoc = {
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

/** Migrate a model document to a different theory, or switch its editor variant.
 */
export async function switchTheoryOrEditor(
    liveModel: LiveModelDoc,
    editorOrModelId: string,
    theories: TheoryLibrary,
) {
    const { doc, changeDoc } = liveModel.liveDoc;

    let targetBaseId: string = editorOrModelId;
    let targetEditorVariant: string | undefined;
    const isEditor = theories.isEditorVariant(editorOrModelId);
    if (isEditor) {
        const base = theories.getBaseTheoryId(editorOrModelId);
        invariant(base !== undefined, "Editor variant must have a base theory");
        targetBaseId = base;
        targetEditorVariant = editorOrModelId;
    }

    // If only the editor variant is changing (same base theory), just flip the field.
    if (targetBaseId === doc.theory) {
        changeDoc((doc) => {
            if (targetEditorVariant) {
                doc.editorVariant = targetEditorVariant;
            } else {
                delete doc.editorVariant;
            }
        });
        return;
    }

    // Real theory migration below.
    const targetTheory = await theories.get(targetBaseId);
    const theory = liveModel.theory();
    let model = liveModel.elaboratedModel();
    invariant(theory && model); // FIXME: Should fail gracefully.

    // Trivial migration.
    if (!NotebookUtils.hasFormalCells(doc.notebook) || theory.inclusions.includes(targetBaseId)) {
        changeDoc((doc) => {
            doc.theory = targetBaseId;
            if (targetEditorVariant) {
                doc.editorVariant = targetEditorVariant;
            } else {
                delete doc.editorVariant;
            }
        });
        return;
    }

    // Pushforward migration.
    const migration = theory.pushforwards.find((m) => m.target === targetBaseId);
    if (!migration) {
        throw new Error(`No migration defined from ${theory.id} to ${targetBaseId}`);
    }
    // TODO: We need a general method to propagate changes from catlog models to
    // notebooks. This stop-gap solution only works because pushforward
    // migration doesn't have to create/delete cells, only update types.
    model = migration.migrate(model, targetTheory.theory);
    changeDoc((doc) => {
        doc.theory = targetBaseId;
        if (targetEditorVariant) {
            doc.editorVariant = targetEditorVariant;
        } else {
            delete doc.editorVariant;
        }
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
