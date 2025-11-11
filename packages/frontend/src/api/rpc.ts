import { build_client, http } from "@qubit-rs/client";
import type { QubitServer, RpcResult } from "catcolab-api";
import type { FirebaseApp } from "firebase/app";
import { getAuth, type User } from "firebase/auth";
import type { Accessor } from "solid-js";

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

// Type guard for type narrowing inside SolidJS JSX blocks controlled by a `when` attribute.
//
// example usage:
// type Result = { tag: "Ok", content: string } | { tag: "Err", code: number };
// const [result, setResult] = createSignal<Result>({tag: "Err", code: 0 });
// ...
// <Match when={narrow(result, (res) => res.tag === "Ok")}>
//     {(result) => {
//         const a = result(); // the type of a is narrowed to { tag: "Ok", content: string }
// }
export function narrow<A, B extends A>(accessor: Accessor<A>, guard: (v: A) => v is B): B | null {
    const val = accessor();
    if (guard(val)) {
        return val;
    }

    return null;
}

// Type guard for narrowing a SolidJS RpcResult resource/signal to it's "Err" variant
// See comment on `narrow` function
export function rpcResourceOk<A>(
    resource: Accessor<RpcResult<A> | undefined>,
): Extract<RpcResult<A>, { tag: "Ok" }> | null {
    const result = resource();

    if (result?.tag === "Ok") {
        return result;
    }

    return null;
}

// Type guard for narrowing a SolidJS RpcResult resource/signal to it's "Err" variant
// See comment on `narrow` function
export function rpcResourceErr<A>(
    resource: Accessor<RpcResult<A> | undefined>,
): Extract<RpcResult<A>, { tag: "Err" }> | null {
    const result = resource();

    if (result?.tag === "Err") {
        return result;
    }

    return null;
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
