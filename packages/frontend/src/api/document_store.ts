import { applyPatches, diff, getHeads, type Heads, load, save, toJS } from "@automerge/automerge";
import { DocHandle, generateAutomergeUrl, parseAutomergeUrl } from "@automerge/automerge-repo";
import type { UserState } from "catcolab-api/src/user_state";
import type { Auth } from "firebase/auth";
import { stringify as uuidStringify } from "uuid";

import type { Document, LinkType } from "catcolab-document-types";
import {
    type Binder,
    createBinder,
    DeepReadonly,
    type DocumentChange,
    type DocumentRef,
    type DocumentStore,
    type HandlesByLinkType,
    type MetaDocument,
    type RelationInfo,
    type Result,
} from "catcolab-documents";
import { createApiMetaDocument } from "./meta_document";
import type { Api } from "./types";

export type ApiDocumentHandle = {
    automergeHandle: DocHandle<Document>;

    ref: DocumentRef;
};

/** The version type of the API document store: Automerge heads. */
export type ApiDocumentVersion = Heads;

export type ApiDocumentStore = DocumentStore<ApiDocumentHandle, Heads>;

/** A binder over the API document store. */
export type ApiBinder = Omit<Binder<ApiDocumentHandle, Heads>, "meta"> & {
    readonly meta: MetaDocument<UserState>;
    dispose(): void;
};

/** Create a binder over the document store for an API client and Firebase auth.

The binder should be created once per API client and shared across the
application (via context) so that document handles are cached and deduplicated
between loads. Dispose it when the owning provider is destroyed to release
metadata and auth subscriptions.
 */
export function createApiBinder(api: Api, auth: Auth): ApiBinder {
    const apiMeta = createApiMetaDocument(api, auth);
    const binder = createBinder(createApiDocumentStore(api, apiMeta.doc));
    return { ...binder, meta: apiMeta.doc, dispose: apiMeta.dispose };
}

/** Adapt frontend Automerge documents to the storage boundary used by catcolab-documents.

The metadata document tracks relations between documents and may update while
the store lives.
 */
export function createApiDocumentStore(api: Api, meta: MetaDocument): ApiDocumentStore {
    const handles = new Map<string, ApiDocumentHandle>();

    const cacheHandle = (ref: DocumentRef, automergeHandle: DocHandle<Document>) => {
        const existing = handles.get(ref.id);
        if (existing) {
            existing.ref = ref;
            return existing;
        }
        const handle = { automergeHandle, ref };
        handles.set(ref.id, handle);
        return handle;
    };

    const draftHandle = (automergeDraft: DocHandle<Document>): ApiDocumentHandle => ({
        automergeHandle: automergeDraft,
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
        relations: ReadonlyArray<DeepReadonly<RelationInfo>>,
        data: ReturnType<MetaDocument["data"]>,
    ): Promise<HandlesByLinkType<ApiDocumentHandle>> {
        const linked: Record<LinkType, ApiDocumentHandle[]> = {
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [],
            "llmconversation-of": [],
            instantiation: [],
        };
        for (const relation of relations) {
            if (!Object.hasOwn(linked, relation.relationType)) {
                continue;
            }
            const refId = uuidStringify(Uint8Array.from(relation.refId));
            if (data.documents[refId]?.deletedAt !== null) {
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
        // We `save` and `load` rather than `clone` due to how solidjs and automerge interact: https://github.com/chee/solid-automerge/pull/8
        draft.update(() => load<Document>(save(source.doc())));
        draft.doneLoading();
        return draft;
    };

    return {
        meta,
        async createHandle(initialDoc) {
            const refId = await api.createDoc(initialDoc);
            const automergeHandle = await api.getDocHandle(refId);
            return cacheHandle(
                { id: refId, version: null, server: api.serverHost },
                automergeHandle,
            );
        },
        getDocumentSnapshot: (handle) => makeDocumentSnapshot(handle.automergeHandle),
        changeDocument: (handle, fn) => handle.automergeHandle.change(fn),
        subscribe: (handle, callback) => {
            const onChange = () => callback(handle);
            handle.automergeHandle.on("change", onChange);
            return () => {
                handle.automergeHandle.off("change", onChange);
            };
        },
        getDocumentRef: (handle) => handle.ref,
        async listUsedBy(handle) {
            const data = meta.data();
            return resolveLinked(data.documents[handle.ref.id]?.usedBy ?? [], data);
        },
        async listDependsOn(handle) {
            const data = meta.data();
            return resolveLinked(data.documents[handle.ref.id]?.dependsOn ?? [], data);
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
            void draft.automergeHandle.whenReady().then(() => draft.automergeHandle.delete());
            return { before, after };
        },
        discardDraft: (draft) => {
            handles.delete(draft.automergeHandle.documentId);
            void draft.automergeHandle.whenReady().then(() => draft.automergeHandle.delete());
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

const snapshotCache = new WeakMap<
    DocHandle<Document>,
    { heads: string; snapshot: DeepReadonly<Document> }
>();

/** Materialize a document, preserving identity across merges with unchanged heads. */
function makeDocumentSnapshot(
    handle: DocHandle<Document>,
    document: Readonly<Document> = handle.doc(),
): DeepReadonly<Document> {
    const heads = getHeads<Document>(document).toSorted().join(",");
    const cached = snapshotCache.get(handle);
    if (cached?.heads === heads) {
        return cached.snapshot;
    }
    const snapshot = structuredClone(toJS<Document>(document));
    snapshotCache.set(handle, { heads, snapshot });
    return snapshot;
}
