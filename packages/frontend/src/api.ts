import type * as A from "@automerge/automerge-repo";
import type * as trpc from "@trpc/client";
import type { AppRouter } from "backend/src/index.js";
import { createContext } from "solid-js";
import * as uuid from "uuid";
import { makeReactive } from "./util/automerge_solid";

export type RPCClient = ReturnType<typeof trpc.createTRPCClient<AppRouter>>;

export const RPCContext = createContext<RPCClient>();
export const RepoContext = createContext<A.Repo>();

export type RetrievedDocument<T> = {
    doc: T;
    docHandle: A.DocHandle<T>;
};

export async function retrieve<T extends object>(
    client: RPCClient,
    ref: string,
    repo: A.Repo,
): Promise<RetrievedDocument<T>> {
    let docId: A.DocumentId;

    if (uuid.validate(ref)) {
        const res = await client.docIdFor.query(ref);
        if (!res) {
            throw `Failed to get documentId for ref ${ref}`;
        }
        docId = res;
    } else {
        throw `Invalid ref ${ref}`;
    }

    const docHandle = repo.find(docId) as A.DocHandle<T>;
    const doc = await makeReactive(docHandle);

    return { doc, docHandle };
}
