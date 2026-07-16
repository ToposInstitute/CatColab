import { type FirebaseOptions, initializeApp } from "firebase/app";
import { deleteUser, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import invariant from "tiny-invariant";
import { afterAll, assert, describe, test } from "vitest";

import { initTestUserAuth } from "../util/test_util.ts";
import { createFetchWithAuth, createRpcClient, unwrap, unwrapErr } from "./rpc.ts";

// These tests exercise the live `get_inference_key` RPC, which creates
// OpenRouter child keys when a provisioning key is configured. They are skipped
// unless `VITE_RUN_INFERENCE_TESTS=1` is set, so they run locally but not in
// CI. To run them, ensure you have a backend running; they work both with and
// without `OPENROUTER_PROVISIONING_KEY` set.
const enabled = import.meta.env.VITE_RUN_INFERENCE_TESTS === "1";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const firebaseApp = initializeApp(firebaseOptions);
const rpc = createRpcClient(serverUrl, createFetchWithAuth(firebaseApp));

(enabled ? describe : describe.skip)("RPC for inference keys", async () => {
    const auth = getAuth(firebaseApp);
    const email = "test-inference-key@catcolab.org";
    const password = "foobar";
    await initTestUserAuth(auth, email, password);

    const user = auth.currentUser;
    invariant(user);
    afterAll(async () => user && (await deleteUser(user)));

    unwrap(await rpc.sign_up_or_sign_in.mutate());

    const authResult = await rpc.get_inference_key.query();
    test.sequential("should return a key, or report inference unavailable", () => {
        if (authResult.tag === "Ok") {
            assert.ok(authResult.content.length > 0, "key should be a non-empty string");
        } else {
            assert.strictEqual(
                authResult.code,
                503,
                "only expected authenticated error is inference unavailable (503)",
            );
        }
    });

    const secondResult = await rpc.get_inference_key.query();
    test.sequential("should return the same value on a second call", () => {
        assert.strictEqual(secondResult.tag, authResult.tag);
        if (authResult.tag === "Ok" && secondResult.tag === "Ok") {
            assert.strictEqual(secondResult.content, authResult.content);
        }
    });

    await signOut(auth);

    const unauthResult = await rpc.get_inference_key.query();
    test.sequential("should prohibit key retrieval when unauthenticated", () => {
        assert.strictEqual(unwrapErr(unauthResult).code, 401);
    });

    await signInWithEmailAndPassword(auth, email, password);
});
