import { applyPatches, clone, diff, getHeads, type Heads } from "@automerge/automerge";
import { DocHandle, generateAutomergeUrl, parseAutomergeUrl } from "@automerge/automerge-repo";
import type { RelationInfo, UserState } from "catcolab-api/src/user_state";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { stringify as uuidStringify } from "uuid";

import type { Document, LinkType } from "catcolab-document-types";
import {
    type Binder,
    createBinder,
    type DocumentChange,
    type DocumentRef,
    type DocumentStore,
    type HandlesByLinkType,
    type Result,
} from "catcolab-documents";
import { makeDocHandleReactive } from "./document";
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

/** Create a binder over the document store for an API client and user state.

The binder should be created once per API client and shared across the
application (via context) so that document handles are cached and deduplicated
between loads.
 */
export function createApiBinder(api: Api, userState: UserState): ApiBinder {
    return createBinder(createApiDocumentStore(api, userState));
}

/** Adapt frontend Automerge documents to the storage boundary used by catcolab-documents.

The user state tracks relations between documents; it is retrieved from
application context (see `UserStateContext`) rather than fetched here, and it
may update while the store lives.
 */
export function createApiDocumentStore(api: Api, userState: UserState): ApiDocumentStore {
    const handles = new Map<string, ApiDocumentHandle>();

    const cacheHandle = (ref: DocumentRef, automergeHandle: DocHandle<Document>) => {
        const existing = handles.get(ref.id);
        if (existing) {
            existing.ref = ref;
            return existing;
        }
        const handle = { automergeHandle, docView: makeDocHandleReactive(automergeHandle), ref };
        handles.set(ref.id, handle);
        return handle;
    };

    const draftHandle = (automergeDraft: DocHandle<Document>): ApiDocumentHandle => ({
        automergeHandle: automergeDraft,
        docView: makeDocHandleReactive(automergeDraft),
        ref: {
            id: automergeDraft.documentId,
            version: null,
            server: api.serverHost,
        },
    });

    async function getHandle(ref: DocumentRef): Promise<Result<ApiDocumentHandle>> {
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
    }

    /** Resolve the relations recorded for a document in the user state into
     * handles, indexed by link type. Relations of unknown link types, and
     * relations to documents that no longer exist, are skipped. */
    async function resolveLinked(
        relations: ReadonlyArray<RelationInfo>,
    ): Promise<HandlesByLinkType<ApiDocumentHandle>> {
        const linked: Record<LinkType, ApiDocumentHandle[]> = {
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [],
            "llmconversation-of": [],
            instantiation: [],
        };
        for (const relation of relations) {
            if (!(relation.relationType in linked)) {
                continue;
            }
            const refId = uuidStringify(relation.refId);
            if (userState.documents[refId]?.deletedAt !== null) {
                continue;
            }
            const result = await getHandle({ id: refId, version: null, server: api.serverHost });
            if (result.tag === "Ok") {
                linked[relation.relationType as LinkType].push(result.content);
            }
        }
        return linked;
    }

    const createAutomergeDraft = (source: DocHandle<Document>): DocHandle<Document> => {
        const { documentId } = parseAutomergeUrl(generateAutomergeUrl());
        const draft = new DocHandle<Document>(documentId, () => {
            throw new Error("Document refs are not supported on drafts.");
        });
        draft.update(() => clone(source.doc()));
        draft.doneLoading();
        return draft;
    };

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
        async listUsedBy(handle) {
            return resolveLinked(userState.documents[handle.ref.id]?.usedBy ?? []);
        },
        async listDependsOn(handle) {
            return resolveLinked(userState.documents[handle.ref.id]?.dependsOn ?? []);
        },
        getHandle,
        createDraft: (handle) => {
            const automergeDraft = createAutomergeDraft(handle.automergeHandle);
            const draft = draftHandle(automergeDraft);
            handles.set(automergeDraft.documentId, draft);
            return draft;
        },
        commitDraft: (handle, draft) => {
            // Trust automerge to figure this out
            const before = getHeads(handle.automergeHandle.doc());
            handle.automergeHandle.merge(draft.automergeHandle);
            const after = getHeads(handle.automergeHandle.doc());

            handles.delete(draft.automergeHandle.documentId);
            draft.automergeHandle.delete();
            return { before, after };
        },
        discardDraft: (draft) => {
            handles.delete(draft.automergeHandle.documentId);
            draft.automergeHandle.delete();
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
