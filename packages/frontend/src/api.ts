import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import { http, build_client } from "@qubit-rs/client";
import { createContext } from "solid-js";
import * as uuid from "uuid";

import type { QubitServer } from "catcolab-api";
import { makeDocReactive } from "./util/automerge_solid";

export const createRPCClient = (serverUrl: string) =>
    build_client<QubitServer>(http(`${serverUrl}/rpc`));

export type RPCClient = QubitServer;

/** Context for the RPC client to communicate with backend. */
export const RPCContext = createContext<RPCClient>();

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
    client: RPCClient,
    refId: string,
    repo: Repo,
): Promise<RetrievedDoc<T>> {
    let docId: DocumentId;

    if (uuid.validate(refId)) {
        const result = await client.doc_id.query(refId);
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
