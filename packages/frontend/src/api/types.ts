import { type DocHandle, type DocumentId, Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import type { FirebaseApp } from "firebase/app";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import type { Document, StableRef } from "catlog-wasm";
import type { InterfaceToType } from "../util/types";
import { type LiveDoc, getLiveDocFromDocHandle } from "./document";
import { type RpcClient, createRpcClient } from "./rpc";

/** Bundle of everything needed to interact with the CatColab backend. */
export class Api {
    /** Host part of the URL for the CatColab backend server. */
    readonly serverHost: string;

    /** RPC client for the CatColab backend API. */
    readonly rpc: RpcClient;

    /** Automerge repo connected to the Automerge document server. */
    readonly repo: Repo;

    /** An Automerge repo with no networking, used for read-only documents. */
    private readonly localRepo: Repo;

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
    }

    /** Retrieve a live document from the backend.

    When the user has write permissions, changes to the document will be
    propagated by Automerge to the backend and to other clients. When the user
    has only read permissions, the Automerge doc handle will be "fake", existing
    only locally in the client. And if the user doesn't even have read
    permissions, this method will raise a `PermissionsError`.
     */
    async getLiveDoc<Doc extends Document>(
        refId: string,
        docType?: Doc["type"],
    ): Promise<LiveDoc<Doc>> {
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

        let docHandle: DocHandle<Doc>;
        if (refDoc.tag === "Live") {
            const docId = refDoc.docId as DocumentId;
            docHandle = (await this.repo.find(docId)) as DocHandle<Doc>;
        } else {
            const init = refDoc.content as unknown as Doc;
            docHandle = this.localRepo.create(init);
        }

        const { permissions } = refDoc;
        return {
            ...getLiveDocFromDocHandle(docHandle, docType),
            docRef: {
                refId,
                permissions,
            },
        };
    }

    /** Create a new document in the backend, returning its ref ID. */
    async createDoc(init: Document): Promise<string> {
        const result = await this.rpc.new_ref.mutate(init as InterfaceToType<Document>);
        invariant(result.tag === "Ok", `Failed to create a new ${init.type}`);

        return result.content;
    }

    /** Duplicate a document in the backend, returning the new ref ID. */
    async duplicateDoc(doc: Document): Promise<string> {
        const init: Document = {
            ...doc,
            name: `${doc.name} (copy)`,
        };

        const result = await this.rpc.new_ref.mutate(init as InterfaceToType<Document>);
        invariant(result.tag === "Ok", `Failed to duplicate the ${doc.type}`);

        return result.content;
    }

    /** Create a stable reference to a document ref, without a version. */
    makeUnversionedRef(refId: string): StableRef {
        return {
            _id: refId,
            _version: null,
            _server: this.serverHost,
        };
    }
}

/** Error raised when backend reports that permissions are insufficient. */
export class PermissionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PermisssionsError";
    }
}
