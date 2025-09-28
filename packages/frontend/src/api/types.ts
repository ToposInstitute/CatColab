import type { ChangeFn, DocHandle, Repo } from "@automerge/automerge-repo";

import type { Permissions } from "catcolab-api";
import type { Document } from "catlog-wasm";
import type { RpcClient } from "./rpc";

/** Bundle of everything needed to interact with the CatColab backend. */
export type Api = {
    /** Host part of the URL for the CatColab backend server. */
    serverHost: string;

    /** RPC client for the CatColab backend API. */
    rpc: RpcClient;

    /** Automerge repo connected to the Automerge document server. */
    repo: Repo;
};

/** Live document, typically retrieved from the backend.

A live document can be used in reactive contexts and is connected to an
Automerge document handle.
 */
export type LiveDoc<Doc extends Document> = {
    /** The document data, suitable for use in reactive contexts.

    This data should never be mutated directly. Instead, call `changeDoc` or, if
    necessary, use the Automerge document handle.
     */
    doc: Doc;

    /** Call this function to make changes to the document. */
    changeDoc: (f: ChangeFn<Doc>) => void;

    /** The Automerge document handle for the document. */
    docHandle: DocHandle<Doc>;

    /** Associated document ref in the backend, if any.

    In typical usage of the official CatColab frontend and backend, this field
    will be set, but lower-level components in the frontend are decoupled from
    the backend, relying on Automerge only.
     */
    docRef?: DocRef;
};

/** Info about a document ref in the CatColab backend. */
type DocRef = {
    /** ID of the document ref. */
    refId: string;

    /** Permissions for the document ref. */
    permissions: Permissions;
};
