import { http, build_client } from "@qubit-rs/client";
import type { FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { createContext } from "solid-js";

import type { QubitServer } from "catcolab-api";

/** RPC client for communicating with the CatColab backend. */
export type RpcClient = QubitServer;

/** Create the RPC client for communicating with the backend. */
export function createRpcClient(serverUrl: string, firebaseApp?: FirebaseApp) {
    const fetchWithAuth: typeof fetch = async (input, init?) => {
        const user = firebaseApp && getAuth(firebaseApp).currentUser;
        if (user) {
            const token = await user.getIdToken();
            init = {
                ...init,
                headers: {
                    ...init?.headers,
                    Authorization: `Bearer ${token}`,
                    "Access-Control-Allow-Headers": "Authorization,Content-Type",
                },
            };
        }
        return await fetch(input, init);
    };
    const transport = http(`${serverUrl}/rpc`, {
        fetch: fetchWithAuth,
    });
    return build_client<QubitServer>(transport);
}

/** Context for the RPC client. */
export const RpcContext = createContext<RpcClient>();
