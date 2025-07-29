import { type Accessor, createMemo, createResource } from "solid-js";
import invariant from "tiny-invariant";

import {
    type AutomergeHeads,
    type DblModel,
    type DblModelNext,
    type Document,
    elaborateModel,
    ElaborationDatabase,
    type ModelJudgment,
    type ModelValidationResult,
    type Uuid,
} from "catlaborator";
import { type Api, getLiveDoc, type LiveDoc } from "../api";
import { newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import type { Theory } from "../theory";
import { type IndexedMap, indexMap } from "../util/indexing";
import type { InterfaceToType } from "../util/types";

export type ModelDocument = Document & { type: "model" };

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

    /** A memo of the model elaborated with the next-gen support for importing notebooks */
    validatedModelNext: Accessor<DblModelNext | undefined>;
};

/** A validated model as represented in `catlog`. */
export type ValidatedModel = {
    model: DblModel;
    result: ModelValidationResult;
};

function enlivenModelDocument(
    api: Api,
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
            const model = elaborateModel(doc, theory().theory);
            const result = model.validate();
            return { model, result };
        },
        undefined,
        { equals: false },
    );

    const cache = new ElaborationDatabase();

    const [validatedModelNext, { refetch }] = createResource<DblModelNext | undefined>(async () => {
        const th = theory();
        if (th) {
            return await catlaborate(api, cache, refId, theories);
        }
    });

    liveDoc.docHandle.on("change", () => {
        refetch();
    });

    return {
        type: "model",
        refId,
        liveDoc,
        formalJudgments,
        objectIndex,
        morphismIndex,
        theory,
        validatedModel,
        validatedModelNext,
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
    return enlivenModelDocument(api, refId, liveDoc, theories);
}

async function cacheNotebooksReferredToFrom(
    api: Api,
    cache: ElaborationDatabase,
    refId: string,
    theories: TheoryLibrary,
) {
    const liveDoc = await getLiveDoc(api, refId, "model");
    if (!liveDoc) {
        throw new Error(`could not find document id ${refId}`);
    }
    const docHandle = liveDoc.docHandle;
    const doc = await docHandle.doc();
    const heads = docHandle.heads() as AutomergeHeads;
    if (cache.contains(refId, heads)) {
        return;
    }
    if (!doc) {
        throw new Error(`could not load document id ${refId}`);
    }
    if (doc.type !== "model") {
        throw new Error(`can only elaborate model documents`);
    }
    const theory = theories.get(doc.theory).theory;
    cache.insertNotebook(refId, heads, theory, doc);
    for (const cell of doc.notebook.cells) {
        if (cell.tag == "formal" && cell.content.tag == "instance") {
            await cacheNotebooksReferredToFrom(api, cache, cell.content.notebook_id, theories);
        }
    }
}

export async function catlaborate(
    api: Api,
    cache: ElaborationDatabase,
    refId: string,
    theories: TheoryLibrary,
): Promise<DblModelNext | undefined> {
    await cacheNotebooksReferredToFrom(api, cache, refId, theories);
    const model = cache.createModel(refId);
    if (model) {
        console.log(model.show());
    }
    return model;
}
