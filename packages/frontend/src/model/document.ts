import { type Accessor, createMemo } from "solid-js";
import invariant from "tiny-invariant";

import type { JsonValue } from "catcolab-api";
import type { DblModel, ModelValidationResult, Uuid } from "catlog-wasm";
import { type Api, type Document, type LiveDoc, getLiveDoc } from "../api";
import { type Notebook, newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import type { Theory } from "../theory";
import { type IndexedMap, indexMap } from "../util/indexing";
import { type ModelJudgment, toCatlogModel } from "./types";

/** A document defining a model. */
export type ModelDocument = Document<"model"> & {
    /** Identifier of double theory that the model is of. */
    theory: string;

    /** Content of the model, formal and informal. */
    notebook: Notebook<ModelJudgment>;
};

/** Create an empty model document. */
export const newModelDocument = (theory: string): ModelDocument => ({
    name: "",
    type: "model",
    theory,
    notebook: newNotebook(),
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
    theory: Accessor<Theory>;

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
    const formalJudgments = createMemo<Array<ModelJudgment>>(() => {
        return doc.notebook.cells
            .filter((cell) => cell.tag === "formal")
            .map((cell) => cell.content);
    }, []);

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

    const theory = createMemo<Theory>(() => theories.get(doc.theory));

    const validatedModel = createMemo<ValidatedModel | undefined>(
        () => {
            const th = theory();
            if (th) {
                const model = toCatlogModel(th.theory, formalJudgments());
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

    const result = await api.rpc.new_ref.mutate(init as JsonValue);
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
