import type { Repo } from "@automerge/automerge-repo";
import { createContext } from "solid-js";

import type { RpcClient } from "./rpc";

/** Context for the Automerge repo. */
export const RepoContext = createContext<Repo>();

/** Context for the RPC client. */
export const RpcContext = createContext<RpcClient>();
