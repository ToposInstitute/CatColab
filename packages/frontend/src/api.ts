import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import { http, build_client } from "@qubit-rs/client";
import { createContext } from "solid-js";
import * as uuid from "uuid";

import type { QubitServer } from "catcolab-api";
import { makeDocReactive } from "./util/automerge_solid";

/** RPC client for communicating with the CatColab backend. */
export type RpcClient = QubitServer;

/** Create the RPC client for communication with the backend. */
export const createRpcClient = (serverUrl: string) =>
    build_client<QubitServer>(http(`${serverUrl}/rpc`));

/** Context for the RPC client. */
export const RpcContext = createContext<RpcClient>();

/** Context for the Automerge repo. */
export const RepoContext = createContext<Repo>();

/** Automerge document retrieved from the backend. */
export type RetrievedDoc<T> = {
    doc: T;
    docHandle: DocHandle<T>;
};

/** Retrieve an Automerge document from the backend.

Returns a document that is reactive along with the Automerge document handle.
 */
export async function retrieveDoc<T extends object>(
    rpc: RpcClient,
    refId: string,
    repo: Repo,
): Promise<RetrievedDoc<T>> {
    let docId: DocumentId;

    if (uuid.validate(refId)) {
        const result = await rpc.doc_id.query(refId);
        if (result.tag === "Ok") {
            docId = result.content as DocumentId;
        } else {
            throw new Error(`Failed to retrieve document: ${result.message}`);
        }
    } else {
        throw new Error(`Invalid document ref ${refId}`);
    }

    const docHandle = repo.find(docId) as DocHandle<T>;
    const doc = await makeDocReactive(docHandle);

    return { doc, docHandle };
}
