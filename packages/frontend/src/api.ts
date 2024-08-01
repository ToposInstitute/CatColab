import type { AppRouter } from "backend/src/index.js";
import * as trpc from "@trpc/client";

export type RPCClient = ReturnType<typeof trpc.createTRPCClient<AppRouter>>;
