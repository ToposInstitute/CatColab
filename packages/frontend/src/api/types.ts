import { type DocHandle, type DocumentId, Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import type { FirebaseApp } from "firebase/app";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import type { Permissions } from "catcolab-api";
import type { Document, StableRef, Uuid } from "catlog-wasm";
import type { InterfaceToType } from "../util/types";
import { type LiveDoc, findAndMigrate, makeLiveDoc } from "./document";
import { type RpcClient, createRpcClient } from "./rpc";

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

    /** Get a live document for the given document ref.

    When the user has write permissions, changes to the document will be
    propagated by Automerge to the backend and to other clients. When the user
    has only read permissions, the Automerge doc handle will be "fake", existing
    only locally in the client. And if the user doesn't even have read
    permissions, this method will raise a `PermissionsError`.
     */
    async getLiveDoc<Doc extends Document>(
        refId: Uuid,
        docType?: Doc["type"],
    ): Promise<LiveDoc<Doc>> {
        const { docId, permissions, localOnly } = await this.getDocCacheEntry(refId);
        const repo = localOnly ? this.localRepo : this.repo;
        const docHandle = await findAndMigrate<Doc>(repo, docId, docType);
        return makeLiveDoc(docHandle, {
            refId,
            permissions,
        });
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

    /** Get an Automerge document ID for the given document ref. */
    async getDocId(refId: Uuid): Promise<DocumentId> {
        const { docId } = await this.getDocCacheEntry(refId);
        return docId;
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

        const { permissions } = refDoc;
        const entry: DocCacheEntry = {
            docId,
            permissions,
            localOnly: !isLive,
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

    /** Create a stable reference to a document ref, without a version. */
    makeUnversionedRef(refId: Uuid): StableRef {
        return {
            _id: refId,
            _version: null,
            _server: this.serverHost,
        };
    }
}

type DocCacheEntry = {
    docId: DocumentId;
    permissions: Permissions;
    localOnly: boolean;
};

/** Error raised when backend reports that permissions are insufficient. */
export class PermissionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PermisssionsError";
    }
}
