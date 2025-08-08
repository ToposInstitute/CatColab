import { type Accessor, createMemo, createResource } from "solid-js";
import { unwrap } from "solid-js/store";
import invariant from "tiny-invariant";

import {
    type DblModel,
    type Document,
    type ModelJudgment,
    type ModelValidationResult,
    type Uuid,
    currentVersion,
    elaborateModel,
} from "catlog-wasm";
import { type Api, type LiveDoc, getLiveDoc } from "../api";
import { NotebookUtils, newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import type { Theory } from "../theory";
import { type IndexedMap, indexMap } from "../util/indexing";
import type { InterfaceToType } from "../util/types";

/** A document defining a model. */
export type ModelDocument = Document & { type: "model" };

/** Create an empty model document. */
export const newModelDocument = (theory: string): ModelDocument => ({
    name: "",
    type: "model",
    theory,
    notebook: newNotebook(),
    version: currentVersion(),
});

/** A model document "live" for editing.

Contains a live document for the model, plus various memos of derived data.
 */
export type LiveModelDocument = {
    /** discriminator for use in union types */
    type: "model";

    /** The ref for which this is a live document. */
    refId: string;

    /** Live document with the model data. */
    liveDoc: LiveDoc<ModelDocument>;

    /** A memo of the formal content of the model. */
    formalJudgments: Accessor<Array<ModelJudgment>>;

    /** A memo of the indexed map from object ID to name. */
    objectIndex: Accessor<IndexedMap<Uuid, string>>;

    /** A memo of the indexed map from morphism ID to name. */
    morphismIndex: Accessor<IndexedMap<Uuid, string>>;

    /** A memo of the double theory that the model is of. */
    theory: Accessor<Theory | undefined>;

    /** A memo of the model constructed and validated in the core. */
    validatedModel: Accessor<ValidatedModel | undefined>;
};

/** A validated model as represented in `catlog`. */
export type ValidatedModel = {
    model: DblModel;
    result: ModelValidationResult;
};

function enlivenModelDocument(
    refId: string,
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

    const objectIndex = createMemo<IndexedMap<Uuid, string>>(() => {
        const map = new Map<Uuid, string>();
        for (const judgment of formalJudgments()) {
            if (judgment.tag === "object") {
                map.set(judgment.id, judgment.name);
            }
        }
        return indexMap(map);
    }, indexMap(new Map()));

    const morphismIndex = createMemo<IndexedMap<Uuid, string>>(() => {
        const map = new Map<Uuid, string>();
        for (const judgment of formalJudgments()) {
            if (judgment.tag === "morphism") {
                map.set(judgment.id, judgment.name);
            }
        }
        return indexMap(map);
    }, indexMap(new Map()));

    const [theory] = createResource(
        () => doc.theory,
        (theoryId) => theories.get(theoryId),
    );

    const validatedModel = createMemo<ValidatedModel | undefined>(
        () => {
            // NOTE: Reactively depend on formal judgments but, by `unwrap`-ing,
            // not anything else in the document.
            formalJudgments();

            const coreTheory = theory()?.theory;
            if (coreTheory) {
                const model = elaborateModel(unwrap(doc), coreTheory);
                const result = model.validate();
                return { model, result };
            }
        },
        undefined,
        { equals: false },
    );

    return {
        type: "model",
        refId,
        liveDoc,
        formalJudgments,
        objectIndex,
        morphismIndex,
        theory,
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

    const result = await api.rpc.new_ref.mutate(init as InterfaceToType<ModelDocument>);
    invariant(result.tag === "Ok", "Failed to create model");

    return result.content;
}

/** Retrieve a model from the backend and make it "live" for editing. */
export async function getLiveModel(
    refId: string,
    api: Api,
    theories: TheoryLibrary,
): Promise<LiveModelDocument> {
    const liveDoc = await getLiveDoc<ModelDocument>(api, refId, "model");
    return enlivenModelDocument(refId, liveDoc, theories);
}

export async function migrateModelDocument(
    liveDoc: LiveDoc<ModelDocument>,
    targetTheoryId: string,
    theories: TheoryLibrary,
) {
    const theory = await theories.get(liveDoc.doc.theory);
    const targetTheory = await theories.get(targetTheoryId);

    // Trivial migration.
    if (
        !NotebookUtils.hasFormalCells(liveDoc.doc.notebook) ||
        theory.inclusions.includes(targetTheoryId)
    ) {
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
    let model = elaborateModel(liveDoc.doc, theory.theory);
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
