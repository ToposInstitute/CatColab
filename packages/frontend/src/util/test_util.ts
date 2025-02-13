import type { RpcResult } from "catcolab-api";
import { FirebaseError } from "firebase/app";
import {
    type Auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";
import { assert } from "vitest";

/** Unwrap the `Ok` variant of a RPC result. */
export function unwrap<T>(result: RpcResult<T>): T {
    assert.strictEqual(result.tag, "Ok");
    return (result as RpcResult<T> & { tag: "Ok" }).content;
}

/** Unwrap the `Err` variant of a RPC result. */
export function unwrapErr<T>(result: RpcResult<T>): { code: number; message: string } {
    assert.strictEqual(result.tag, "Err");
    return result as RpcResult<T> & { tag: "Err" };
}

export async function initTestUserAuth(auth: Auth, email: string, password: string) {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
        if (e instanceof FirebaseError && e.code === "auth/email-already-in-use") {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            throw e;
        }
    }
}
