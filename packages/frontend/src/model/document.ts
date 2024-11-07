import type { ChangeFn, DocHandle } from "@automerge/automerge-repo";
import { type Accessor, createMemo } from "solid-js";

import type { Permissions } from "catcolab-api";
import type { Uuid } from "catlog-wasm";
import type { ReactiveDoc } from "../api";
import { type Notebook, newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import type { Theory, TheoryId } from "../theory";
import { type IndexedMap, indexMap } from "../util/indexing";
import { type ModelJudgment, type ModelValidationResult, validateModel } from "./types";

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

/** A model document "live" for editing.

Contains a reactive model document and an Automerge document handle, plus
various memos of derived data.
 */
export type LiveModelDocument = {
    /** The ref for which this is a live document. */
    refId: string;

    /** The model document, suitable for use in reactive contexts.

    This data should never be directly mutated. Instead, call `changeDoc` or
    interact directly with the Automerge document handle.
     */
    doc: ModelDocument;

    /** Make a change to the model document. */
    changeDoc: (f: ChangeFn<ModelDocument>) => void;

    /** The Automerge document handle for the model document. */
    docHandle: DocHandle<ModelDocument>;

    /** Permissions for the ref retrieved from the backend. */
    permissions: Permissions;

    /** A memo of the formal content of the model. */
    formalJudgments: Accessor<Array<ModelJudgment>>;

    /** A memo of the indexed map from object ID to name. */
    objectIndex: Accessor<IndexedMap<Uuid, string>>;

    /** A memo of the indexed map from morphism ID to name. */
    morphismIndex: Accessor<IndexedMap<Uuid, string>>;

    /** A memo of the double theory that the model is of, if it is defined. */
    theory: Accessor<Theory | undefined>;

    /** A memo of the result of validation.*/
    validationResult: Accessor<ModelValidationResult | undefined>;
};

export function enlivenModelDocument(
    refId: string,
    reactiveDoc: ReactiveDoc<ModelDocument>,
    theories: TheoryLibrary,
): LiveModelDocument {
    const { doc, docHandle, permissions } = reactiveDoc;

    const changeDoc = (f: ChangeFn<ModelDocument>) => docHandle.change(f);

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

    const theory = createMemo<Theory | undefined>(() => {
        if (doc.theory !== undefined) return theories.get(doc.theory);
    });

    const validationResult = createMemo<ModelValidationResult | undefined>(() => {
        const th = theory();
        return th ? validateModel(th.theory, formalJudgments()) : undefined;
    });

    return {
        refId,
        doc,
        changeDoc,
        docHandle,
        permissions,
        formalJudgments,
        objectIndex,
        morphismIndex,
        theory,
        validationResult,
    };
}
