import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import type * as trpc from "@trpc/client";
import { createContext } from "solid-js";
import * as uuid from "uuid";

import type { AppRouter } from "backend/src/index";
import { makeDocReactive } from "./util/automerge_solid";

export type RPCClient = ReturnType<typeof trpc.createTRPCClient<AppRouter>>;

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
    ref: string,
    repo: Repo,
): Promise<RetrievedDoc<T>> {
    let docId: DocumentId;

    if (uuid.validate(ref)) {
        const res = await client.docIdFor.query(ref);
        if (!res) {
            throw new Error(`Failed to get document ID for ref ${ref}`);
        }
        docId = res;
    } else {
        throw new Error(`Invalid ref ${ref}`);
    }

    const docHandle = repo.find(docId) as DocHandle<T>;
    const doc = await makeDocReactive(docHandle);

    return { doc, docHandle };
}
