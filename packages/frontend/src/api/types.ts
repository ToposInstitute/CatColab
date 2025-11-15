import { type DocHandle, type DocumentId, Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import type { FirebaseApp } from "firebase/app";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import type { Permissions } from "catcolab-api";
import type { Document, Link, LinkType, StableRef, Uuid } from "catlog-wasm";
import type { InterfaceToType } from "../util/types";
import { type DocRef, findAndMigrate, type LiveDocWithRef, makeLiveDoc } from "./document";
import { createRpcClient, type RpcClient } from "./rpc";

/** Bundle of everything needed to interact with the CatColab backend. */
export class Api {
    /** Host part of the URL for the CatColab backend server. */
    readonly serverHost: string;

    /** RPC client for the CatColab backend API. */
    readonly rpc: RpcClient;

    /** Automerge repo connected to the Automerge document server. */
    readonly repo: Repo;

    /** Automerge repo with no networking, used for read-only documents. */
    private readonly localRepo: Repo;

    /** Mapping from document ref ID to Automerge document ID.

    This is the simplest and safest form of caching that we can do. It is
    entirely transient---it will be cleared on a page refresh---but it at least
    ensures that we'll go straight to the Automerge repo's local storage instead
    of thrashing the backend when a document is retrieved by multiple
    components, such as in document breadcrumbs or compositional models.
     */
    private readonly docCache: Map<Uuid, DocCacheEntry>;

    constructor(props: {
        serverUrl: string;
        repoUrl: string;
        firebaseApp: FirebaseApp;
    }) {
        this.serverHost = new URL(props.serverUrl).host;

        this.rpc = createRpcClient(props.serverUrl, props.firebaseApp);

        this.repo = new Repo({
            storage: new IndexedDBStorageAdapter("catcolab"),
            network: [new BrowserWebSocketClientAdapter(props.repoUrl)],
        });
        this.localRepo = new Repo();

        this.docCache = new Map();
    }

    /** Get a live document with backend ref for the given document ref.

    When the user has write permissions, changes to the document will be
    propagated by Automerge to the backend and to other clients. When the user
    has only read permissions, the Automerge doc handle will be "fake", existing
    only locally in the client. And if the user doesn't even have read
    permissions, this method will raise a `PermissionsError`.
     */
    async getLiveDoc<Doc extends Document>(
        refId: Uuid,
        docType?: Doc["type"],
    ): Promise<LiveDocWithRef<Doc>> {
        const docHandle = await this.getDocHandle<Doc>(refId, docType);
        const docRef = await this.getDocRef(refId);
        const liveDoc = makeLiveDoc(docHandle);
        return {
            liveDoc,
            docRef,
        };
    }

    async getLiveDocFromLink<Doc extends Document>(link: Link): Promise<LiveDocWithRef<Doc>> {
        return this.getLiveDoc(link._id);
    }

    /** Gets an Automerge document handle for the given document ref. */
    async getDocHandle<Doc extends Document>(
        refId: Uuid,
        docType?: Doc["type"],
    ): Promise<DocHandle<Doc>> {
        const { docId, localOnly } = await this.getDocCacheEntry(refId);
        const repo = localOnly ? this.localRepo : this.repo;
        return await findAndMigrate<Doc>(repo, docId, docType);
    }

    /** Get a document reference from its id */
    async getDocRef(refId: Uuid): Promise<DocRef> {
        const { permissions, isDeleted } = await this.getDocCacheEntry(refId);
        return {
            refId,
            permissions,
            isDeleted,
        };
    }

    /** Clear cached entry for a document ref. */
    clearCachedDoc(refId: Uuid): void {
        this.docCache.delete(refId);
    }

    private async getDocCacheEntry(refId: Uuid): Promise<DocCacheEntry> {
        const entry = this.docCache.get(refId);
        return entry ? entry : await this.fetchDocCacheEntry(refId);
    }

    private async fetchDocCacheEntry(refId: Uuid): Promise<DocCacheEntry> {
        invariant(uuid.validate(refId), () => `Invalid document ref ${refId}`);

        const result = await this.rpc.get_doc.query(refId);
        if (result.tag !== "Ok") {
            if (result.code === 403) {
                throw new PermissionsError(result.message);
            } else {
                throw new Error(`Failed to retrieve document: ${result.message}`);
            }
        }
        const refDoc = result.content;

        let docId: DocumentId;
        const isLive = refDoc.tag === "Live";
        if (isLive) {
            docId = refDoc.docId as DocumentId;
        } else {
            const docHandle = this.localRepo.create(refDoc.content);
            docId = docHandle.documentId;
        }
        const isDeleted = refDoc.isDeleted;

        const { permissions } = refDoc;
        const entry: DocCacheEntry = {
            docId,
            permissions,
            localOnly: !isLive,
            isDeleted,
        };
        this.docCache.set(refId, entry);

        return entry;
    }

    /** Create a new document in the backend, returning its ref ID. */
    async createDoc(init: Document): Promise<Uuid> {
        const result = await this.rpc.new_ref.mutate(init as InterfaceToType<Document>);
        invariant(result.tag === "Ok", `Failed to create a new ${init.type}`);

        return result.content;
    }

    /** Duplicate a document in the backend, returning the new ref ID. */
    async duplicateDoc(doc: Document): Promise<Uuid> {
        const init: Document = {
            ...doc,
            name: `${doc.name} (copy)`,
        };

        const result = await this.rpc.new_ref.mutate(init as InterfaceToType<Document>);
        invariant(result.tag === "Ok", `Failed to duplicate the ${doc.type}`);

        return result.content;
    }

    /** Create a stable reference to a document, without a version. */
    makeUnversionedRef(refId: Uuid): StableRef {
        return {
            _id: refId,
            _version: null,
            _server: this.serverHost,
        };
    }

    /** Create a link to a document, without a version. */
    makeUnversionedLink(refId: Uuid, linkType: LinkType): Link {
        return {
            ...this.makeUnversionedRef(refId),
            type: linkType,
        };
    }
}

type DocCacheEntry = {
    docId: DocumentId;
    permissions: Permissions;
    localOnly: boolean;
    isDeleted: boolean;
};

/** Error raised when backend reports that permissions are insufficient. */
export class PermissionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PermisssionsError";
    }
}
