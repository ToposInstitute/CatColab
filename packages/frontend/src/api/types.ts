import type { Repo } from "@automerge/automerge-repo";

import type { RpcClient } from "./rpc";

/** Bundle of objects needed to interact with the CatColab backend API. */
export type Api = {
    rpc: RpcClient;
    repo: Repo;
};

/** A reference in a document to another document. */
export type ExternRef = {
    tag: "extern-ref";
    refId: string;
    taxon: string;
};
