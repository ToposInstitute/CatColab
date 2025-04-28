import { http, build_client } from "@qubit-rs/client";
import type { FirebaseApp } from "firebase/app";
import { type User, getAuth } from "firebase/auth";

import type { QubitServer, RpcResult } from "catcolab-api";

/** RPC client for communicating with the CatColab backend. */
export type RpcClient = QubitServer;

/** Create the RPC client for communicating with the backend. */
export function createRpcClient(serverUrl: string, firebaseApp?: FirebaseApp) {
    let currentUser: User | null = null;
    const authInitialized = new Promise<null>((resolve) => {
        if (firebaseApp) {
            getAuth(firebaseApp).onAuthStateChanged((user) => {
                currentUser = user;
                resolve(null);
            });
        } else {
            resolve(null);
        }
    });

    const fetchWithAuth: typeof fetch = async (input, init?) => {
        await authInitialized;
        if (currentUser) {
            const token = await currentUser.getIdToken();
            init = {
                ...init,
                headers: {
                    ...init?.headers,
                    Authorization: `Bearer ${token}`,
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

/** Gets the content an RPC result, if it is `Ok`. */
export function resultOk<T>(result?: RpcResult<T>): T | undefined {
    return result?.tag === "Ok" ? result.content : undefined;
}

/** Gets the error information from an RPC result, if it is `Err`. */
export function resultErr<T>(
    result?: RpcResult<T>,
): Extract<RpcResult<T>, { tag: "Err" }> | undefined {
    return result?.tag === "Err" ? result : undefined;
}

/** Unwraps the `Ok` variant of a RPC result.

Throws an errors if the result is an error.
 */
export function unwrap<T>(result: RpcResult<T>): T {
    if (result.tag !== "Ok") {
        throw new Error(result.message);
    }
    return result.content;
}

/** Unwraps the `Err` variant of a RPC result.

Throws an error if the result is ok.
 */
export function unwrapErr<T>(result: RpcResult<T>): Extract<RpcResult<T>, { tag: "Err" }> {
    if (result.tag !== "Err") {
        throw new Error("Result should be an error, but is ok");
    }
    return result;
}
