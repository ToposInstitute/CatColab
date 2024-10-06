import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import { type Client, FetchTransport, createClient } from "@rspc/client";
import { createContext } from "solid-js";
import * as uuid from "uuid";

import type { Procedures } from "backend";
import { makeDocReactive } from "./util/automerge_solid";

export type RPCClient = Client<Procedures>;

export function createRPCClient(serverUrl: string): RPCClient {
    return createClient<Procedures>({
        transport: new FetchTransport(`${serverUrl}/rpc`),
    });
}

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
        docId = (await client.query(["doc_id", refId])) as DocumentId;
    } else {
        throw new Error(`Invalid ref ${refId}`);
    }

    const docHandle = repo.find(docId) as DocHandle<T>;
    const doc = await makeDocReactive(docHandle);

    return { doc, docHandle };
}
