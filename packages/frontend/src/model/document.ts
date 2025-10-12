import type { AutomergeUrl, Repo } from "@automerge/automerge-repo";
import { type Accessor, createMemo, createResource } from "solid-js";

import {
    type DblModel,
    type Document,
    type ModelJudgment,
    type ModelValidationResult,
    currentVersion,
    elaborateModel,
} from "catlog-wasm";
import { type Api, type LiveDoc, createDoc, getLiveDoc, getLiveDocFromDocHandle } from "../api";
import { NotebookUtils, newNotebook } from "../notebook";
import type { Theory, TheoryLibrary } from "../theory";

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

    /** A memo of the formal content of the model. */
    formalJudgments: Accessor<Array<ModelJudgment>>;

    /** A memo of the double theory that the model is of. */
    theory: Accessor<Theory | undefined>;

    /** A memo of the model eleborated in the core, though possibly invalid. */
    elaboratedModel: Accessor<DblModel | undefined>;

    /** A memo of the model elaborated and validated in the core. */
    validatedModel: Accessor<ValidatedModel | undefined>;
};

/** A validated model as represented in `catlog`. */
export type ValidatedModel =
    /** A successfully elaborated and validated model. */
    | {
          tag: "Valid";
          model: DblModel;
      }
    /** An elaborated model with one or more validation errors. */
    | {
          tag: "Invalid";
          model: DblModel;
          errors: (ModelValidationResult & { tag: "Err" })["content"];
      }
    /** A model that failed to even elaborate. */
    | {
          tag: "Illformed";
          error: string;
      };

function enlivenModelDocument(
    liveDoc: LiveDoc<ModelDocument>,
    theories: TheoryLibrary,
): LiveModelDocument {
    const { doc } = liveDoc;

    // Memo-ize the *formal* content of the notebook, since most derived objects
    // will not depend on the informal (rich-text) content in notebook.
    const formalJudgments = createMemo<Array<ModelJudgment>>(
        () => NotebookUtils.getFormalContent(doc.notebook),
        [],
    );

    const [theory] = createResource(
        () => doc.theory,
        (theoryId) => theories.get(theoryId),
    );

    const elaboratedModel = (): DblModel | undefined => {
        const validated = validatedModel();
        if (validated && validated.tag !== "Illformed") {
            return validated.model;
        }
    };

    const validatedModel = createMemo<ValidatedModel | undefined>(
        () => {
            const th = theory();
            if (!th) {
                // Abort immediately if the theory is undefined.
                return undefined;
            }
            let model: DblModel;
            try {
                model = elaborateModel(formalJudgments(), th.theory);
            } catch (e) {
                return { tag: "Illformed", error: String(e) };
            }
            const result = model.validate();
            if (result.tag === "Ok") {
                return { tag: "Valid", model };
            } else {
                return { tag: "Invalid", model, errors: result.content };
            }
        },
        undefined,
        { equals: false },
    );

    return {
        type: "model",
        liveDoc,
        formalJudgments,
        theory,
        elaboratedModel,
        validatedModel,
    };
}

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
    return createDoc(api, init);
}

/** Retrieve a model from the backend and make it "live" for editing. */
export async function getLiveModel(
    refId: string,
    api: Api,
    theories: TheoryLibrary,
): Promise<LiveModelDocument> {
    const liveDoc = await getLiveDoc<ModelDocument>(api, refId, "model");
    return enlivenModelDocument(liveDoc, theories);
}

/** Get a model from an Automerge repo and make it "live" for editing.

Prefer [`getLiveModel`] unless you're bypassing the official CatColab backend.
 */
export async function getLiveModelFromRepo(
    docId: AutomergeUrl,
    repo: Repo,
    theories: TheoryLibrary,
): Promise<LiveModelDocument> {
    const docHandle = await repo.find<ModelDocument>(docId);
    const liveDoc = getLiveDocFromDocHandle(docHandle);
    return enlivenModelDocument(liveDoc, theories);
}

/** Migrate a model document from one theory to another. */
export async function migrateModelDocument(
    liveDoc: LiveDoc<ModelDocument>,
    targetTheoryId: string,
    theories: TheoryLibrary,
) {
    const doc = liveDoc.doc;
    const theory = await theories.get(doc.theory);
    const targetTheory = await theories.get(targetTheoryId);

    // Trivial migration.
    if (!NotebookUtils.hasFormalCells(doc.notebook) || theory.inclusions.includes(targetTheoryId)) {
        liveDoc.changeDoc((doc) => {
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
    let model = elaborateModel(NotebookUtils.getFormalContent(doc.notebook), theory.theory);
    model = migration.migrate(model, targetTheory.theory);
    liveDoc.changeDoc((doc) => {
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
