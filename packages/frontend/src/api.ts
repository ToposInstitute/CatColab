import type * as trpc from "@trpc/client";
import type { AppRouter } from "backend/src/index.js";

export type RPCClient = ReturnType<typeof trpc.createTRPCClient<AppRouter>>;
