import type { Repo } from "@automerge/automerge-repo";
import { createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { RpcClient } from "./rpc";
import type { Api } from "./types";

/** Context for the Automerge repo. */
export const RepoContext = createContext<Repo>();

/** Context for the RPC client. */
export const RpcContext = createContext<RpcClient>();

/** Retrieve CatColab API from application context. */
export function useApi(): Api {
    const rpc = useContext(RpcContext);
    const repo = useContext(RepoContext);
    invariant(rpc, "RPC client should be provided as context");
    invariant(repo, "Automerge repo should be provided as context");
    return { rpc, repo };
}
