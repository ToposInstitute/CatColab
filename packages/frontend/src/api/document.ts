import type {
    AnyDocumentId,
    ChangeFn,
    DocHandle,
    DocHandleChangePayload,
    Repo,
} from "@automerge/automerge-repo";
import jsonpatch from "fast-json-patch";
import { autoproduce } from "solid-automerge";
import { type Accessor, createEffect, createSignal } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import invariant from "tiny-invariant";

import type { Permissions } from "catcolab-api";
import { type Document, migrateDocument } from "catlog-wasm";
import { assertExhaustive } from "../util/assert_exhaustive";
import { normalizeImmutableStrings } from "../util/immutable_string";

/** Live document, typically retrieved from the backend.

A live document can be used in reactive contexts and is connected to an
Automerge document handle.
 */
export type LiveDoc<Doc extends Document = Document> = {
    /** The document data, suitable for use in reactive contexts.

    This data should never be mutated directly. Instead, call `changeDoc` or, if
    necessary, use the Automerge document handle.
     */
    doc: Doc;

    /** Call this function to make changes to the document. */
    changeDoc: (f: ChangeFn<Doc>) => void;

    /** The Automerge document handle for the document. */
    docHandle: DocHandle<Doc>;
};

/** Live document with backend ref information.

This type combines a live document with its associated document ref from the
backend. Use this type when you need access to both the live document and its
backend metadata (permissions, ref ID, etc.).
 */
export type LiveDocWithRef<Doc extends Document = Document> = {
    /** The live document. */
    liveDoc: LiveDoc<Doc>;

    /** Associated document ref in the backend. */
    docRef: DocRef;
};

/** The type discriminator for documents */
export type DocumentType = Document["type"];

/** Human-readable name for a document type. */
export function documentTypeLabel(documentType: DocumentType): string {
    switch (documentType) {
        case "model":
            return "model";
        case "diagram":
            return "diagram";
        case "analysis":
            return "analysis";
        case "instance":
            return "instance";
        case "llmconversation":
            return "LLM conversation";
        default:
            return assertExhaustive(documentType);
    }
}

/** Info about a document ref in the CatColab backend. */
export type DocRef = {
    /** ID of the document ref. */
    refId: string;

    /** Permissions for the document ref. */
    permissions: Permissions;

    /** Whether the document has been deleted. */
    isDeleted: boolean;
};

/** Gets a document from an Automerge repo, migrating it if necessary.

Prefer calling this function over calling `Repo.find` directly to ensure that
any necessary migrations are performed before the data is accessed.
 */
export async function findAndMigrate(
    repo: Repo,
    docId: AnyDocumentId,
): Promise<DocHandle<Document>> {
    const docHandle = await repo.find<Document>(docId);

    // Perform any migrations on the document.
    const docBefore = docHandle.doc();
    const docAfter = migrateDocument(docBefore);
    if (docBefore.version !== docAfter.version) {
        const patches = jsonpatch
            .compare(docBefore, docAfter)
            // XXX: Ignore metadata added by Patchwork/GAIOS.
            .filter((patch) => !patch.path.startsWith("/@patchwork"));
        docHandle.change((doc: unknown) => {
            jsonpatch.applyPatch(doc, patches);
        });
    }

    return docHandle;
}

/** Create a live document from an Automerge document handle.

When using the official CatColab backend, this function should be called only
indirectly, via [`getLiveDoc`]. However, if you want to bypass the CatColab
backend and fetch a document from another Automerge repo, you can call this
function directly.
 */
export function makeLiveDoc<Doc extends Document>(
    unknownDocHandle: DocHandle<Document>,
    docType?: DocumentType,
): LiveDoc<Doc> {
    if (docType !== undefined) {
        const actualType = unknownDocHandle.doc().type;
        invariant(
            actualType === docType,
            () => `Expected document of type ${docType}, got ${actualType}`,
        );
    }
    const docHandle = unknownDocHandle as DocHandle<Doc>;

    const doc = makeDocumentProjection(docHandle);
    const changeDoc = (f: ChangeFn<Doc>) => docHandle.change(f);
    return { doc, changeDoc, docHandle };
}

const projections = new WeakMap<DocHandle<unknown>, unknown>();

/** Reactive store that follows an Automerge document handle.

Like `makeDocumentProjection` from `solid-automerge`, except that the store
holds a copy of the document. Solid writes into the objects that a store wraps,
and Automerge shares unchanged objects between versions of a document, so a
store wrapping the document itself would overwrite the handle's own view of it
when Patchwork swaps in another branch's content.
 */
function makeDocumentProjection<Doc extends object>(handle: DocHandle<Doc>): Doc {
    const cached = projections.get(handle);
    if (cached) {
        return cached as Doc;
    }

    const [doc, setDoc] = createStore<Doc>(normalizeImmutableStrings(handle.doc()));
    handle.on("change", (payload) => {
        if (isScopeReplaced(payload)) {
            setDoc(reconcile(normalizeImmutableStrings(payload.doc)));
        } else {
            setDoc(produce(autoproduce(payload)));
        }
    });
    projections.set(handle, doc);
    return doc;
}

/** Whether a change replaced the whole document rather than patching it.

Patchwork emits such a change, with no patches, when it re-points a handle at
another branch of the document. Listeners that react to patches must re-read
the document instead.
 */
export function isScopeReplaced(payload: DocHandleChangePayload<unknown>): boolean {
    return (payload as { scopeReplaced?: boolean }).scopeReplaced === true;
}

/** Create a boolean signal for whether an Automerge document handle is ready. */
export function useDocHandleReady(getHandle: () => DocHandle<unknown>): Accessor<boolean> {
    const [isReady, setIsReady] = createSignal<boolean>(false);

    createEffect(() => {
        setIsReady(false);

        void getHandle()
            .whenReady()
            .then(() => {
                setIsReady(true);
            });
    });

    return isReady;
}
