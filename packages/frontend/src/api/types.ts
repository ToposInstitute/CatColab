import type { Repo } from "@automerge/automerge-repo";

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
