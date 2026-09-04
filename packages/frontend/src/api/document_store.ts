import { applyPatches, diff, getHeads, type Heads } from "@automerge/automerge";
import { type DocHandle, type DocumentId, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import type { UserState } from "catcolab-api/src/user_state";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { stringify as uuidStringify } from "uuid";

import type { Document } from "catcolab-document-types";
import {
    type Binder,
    createBinder,
    type DocumentChange,
    type DocumentRef,
    type DocumentStore,
    type Result,
} from "catcolab-documents";
import { normalizeImmutableStrings } from "../util/immutable_string";
import { unwrap as unwrapRpcResult } from "./rpc";
import type { Api } from "./types";

export type ApiDocumentHandle = {
    automergeHandle: DocHandle<Document>;

    /** Fine-grained reactive view of the document, for use in SolidJS contexts. */
    docView: Document;

    ref: DocumentRef;
};

/** The version type of the API document store: Automerge heads. */
export type ApiDocumentVersion = Heads;

export type ApiDocumentStore = DocumentStore<ApiDocumentHandle, Heads>;

/** A binder over the API document store. */
export type ApiBinder = Binder<ApiDocumentHandle, Heads>;

/** Create a binder over the document store for an API client.

The binder should be created once per API client and shared across the
application (via context) so that document handles are cached and deduplicated
between loads.
 */
export function createApiBinder(api: Api): ApiBinder {
    return createBinder(createApiDocumentStore(api));
}

// Drafts live only in this repo, which has neither storage nor networking, so
// that uncommitted edits never reach the backend or other clients.
const draftRepo = new Repo();

/** Get the active user's state document, which tracks relations between documents. */
async function getUserState(api: Api): Promise<UserState> {
    const docId = unwrapRpcResult(await api.rpc.get_user_state_doc_id.query());
    const docHandle = (await api.repo.find(docId as DocumentId)) as DocHandle<UserState>;
    // Automerge materializes string values as `ImmutableString` objects (not
    // primitives) in the browser, so normalize before comparing against
    // primitive strings. `UserStateProvider` does the same for the UI copy.
    return normalizeImmutableStrings(docHandle.doc());
}

/** Adapt frontend Automerge documents to the storage boundary used by catcolab-documents. */
export function createApiDocumentStore(api: Api): ApiDocumentStore {
    const handles = new Map<string, ApiDocumentHandle>();

    const cacheHandle = (ref: DocumentRef, automergeHandle: DocHandle<Document>) => {
        const existing = handles.get(ref.id);
        if (existing) {
            existing.ref = ref;
            return existing;
        }
        const handle = { automergeHandle, docView: makeDocumentProjection(automergeHandle), ref };
        handles.set(ref.id, handle);
        return handle;
    };

    const draftHandle = (automergeDraft: DocHandle<Document>): ApiDocumentHandle => ({
        automergeHandle: automergeDraft,
        docView: makeDocumentProjection(automergeDraft),
        ref: {
            id: automergeDraft.documentId,
            version: null,
            server: api.serverHost,
        },
    });

    return {
        async createHandle(initialDoc) {
            const refId = await api.createDoc(initialDoc);
            const automergeHandle = await api.getDocHandle(refId);
            return cacheHandle(
                { id: refId, version: null, server: api.serverHost },
                automergeHandle,
            );
        },
        getDocumentView: (handle) => handle.docView,
        changeDocument: (handle, fn) => handle.automergeHandle.change(fn),
        subscribe: (handle, callback) => {
            handle.automergeHandle.on("change", callback);
            return () => {
                handle.automergeHandle.off("change", callback);
            };
        },
        copyValue: (_handle, value) => structuredClone(unwrap(value)),
        createReactiveView(initial) {
            const [current, setCurrent] = createStore(initial);
            return {
                current,
                replace(next) {
                    setCurrent(reconcile(next));
                },
            };
        },
        getDocumentRef: (handle) => handle.ref,
        async listInstancesOf(handle) {
            // The user state document tracks backlinks between documents:
            // every instance of this document appears in its `usedBy` relations
            // with relation type "instance-of". Resolve those refs back into
            // store handles like any other document ref.
            const state = await getUserState(api);
            const instanceRefIds = (state.documents[handle.ref.id]?.usedBy ?? [])
                .filter(
                    (relation) =>
                        relation.relationType === "instance-of" &&
                        // Skip instances that no longer exist.
                        state.documents[uuidStringify(relation.refId)]?.deletedAt === null,
                )
                .map((relation) => uuidStringify(relation.refId));
            const instances: ApiDocumentHandle[] = [];
            for (const instanceRefId of instanceRefIds) {
                const result = await this.getHandle({
                    id: instanceRefId,
                    version: null,
                    server: api.serverHost,
                });
                if (result.tag === "Ok") {
                    instances.push(result.content);
                }
            }
            return instances;
        },
        async getHandle(ref: DocumentRef): Promise<Result<ApiDocumentHandle>> {
            if (ref.version !== null) {
                return {
                    tag: "Err",
                    content: [
                        { message: "Pinned document refs are not supported.", path: ["version"] },
                    ],
                };
            }
            if (ref.server && ref.server !== api.serverHost) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cannot resolve a document on server "${ref.server}".`,
                            path: ["server"],
                        },
                    ],
                };
            }
            const canonicalRef = { ...ref, server: ref.server || api.serverHost };

            const cached = handles.get(ref.id);
            if (cached) {
                cached.ref = canonicalRef;
                return { tag: "Ok", content: cached };
            }
            try {
                const automergeHandle = await api.getDocHandle(ref.id);
                return { tag: "Ok", content: cacheHandle(canonicalRef, automergeHandle) };
            } catch (error) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: error instanceof Error ? error.message : String(error),
                            path: ["id"],
                        },
                    ],
                };
            }
        },
        createDraft: (handle) => {
            const automergeDraft = draftRepo.clone(handle.automergeHandle);
            const draft = draftHandle(automergeDraft);
            handles.set(automergeDraft.documentId, draft);
            return draft;
        },
        commitDraft: (handle, draft) => {
            // Trust automerge to figure this out
            const before = getHeads(handle.automergeHandle.doc());
            handle.automergeHandle.merge(draft.automergeHandle);
            const after = getHeads(handle.automergeHandle.doc());

            // The draft clone has served its purpose: evict it from the handle
            // cache and the draft repo so that it is not retained for the rest
            // of the session.
            handles.delete(draft.automergeHandle.documentId);
            draftRepo.delete(draft.automergeHandle.documentId);
            return { before, after };
        },
        discardDraft: (draft) => {
            handles.delete(draft.automergeHandle.documentId);
            draftRepo.delete(draft.automergeHandle.documentId);
        },
        revertCommit: (handle, change: DocumentChange<Heads>) => {
            // Trust automerge to figure this out.
            const inverse = diff(handle.automergeHandle.doc(), change.after, change.before);
            handle.automergeHandle.change((doc) => {
                applyPatches(doc, inverse);
            });
        },
    };
}
