import { type FirebaseOptions, initializeApp } from "firebase/app";
import { deleteUser, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import invariant from "tiny-invariant";
import { afterAll, assert, beforeAll, describe, test } from "vitest";

import { initTestUserAuth } from "../util/test_util.ts";
import { createFetchWithAuth, createRpcClient, unwrap, unwrapErr } from "./rpc.ts";

// These tests exercise the live `get_inference_key` RPC, which creates
// OpenRouter child keys when a provisioning key is configured. They work both
// with and without `OPENROUTER_PROVISIONING_KEY` set.

const serverUrl = import.meta.env.VITE_SERVER_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const firebaseApp = initializeApp(firebaseOptions);
const rpc = createRpcClient(serverUrl, createFetchWithAuth(firebaseApp));

describe("RPC for inference keys", () => {
    const auth = getAuth(firebaseApp);
    const email = "test-inference-key@catcolab.org";
    const password = "foobar";

    beforeAll(async () => {
        await initTestUserAuth(auth, email, password);
        invariant(auth.currentUser);
        unwrap(await rpc.sign_up_or_sign_in.mutate());
    });

    afterAll(async () => {
        if (auth.currentUser) {
            await deleteUser(auth.currentUser);
        }
    });

    test.sequential("should return a stable key, or report inference unavailable", async () => {
        const firstResult = await rpc.get_inference_key.query();
        if (firstResult.tag === "Ok") {
            assert.ok(firstResult.content.length > 0, "key should be a non-empty string");
        } else {
            assert.strictEqual(
                firstResult.code,
                503,
                "only expected authenticated error is inference unavailable (503)",
            );
        }

        const secondResult = await rpc.get_inference_key.query();
        assert.strictEqual(secondResult.tag, firstResult.tag);
        if (firstResult.tag === "Ok" && secondResult.tag === "Ok") {
            assert.strictEqual(secondResult.content, firstResult.content);
        }
    });

    test.sequential("should prohibit key retrieval when unauthenticated", async () => {
        await signOut(auth);
        try {
            const result = await rpc.get_inference_key.query();
            assert.strictEqual(unwrapErr(result).code, 401);
        } finally {
            await signInWithEmailAndPassword(auth, email, password);
        }
    });
});
