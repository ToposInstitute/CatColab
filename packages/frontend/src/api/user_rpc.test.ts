import { type FirebaseOptions, initializeApp } from "firebase/app";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { assert, afterAll, describe, test } from "vitest";

import { createRpcClient } from "./rpc.ts";
import { unwrapErr } from "./test_util.ts";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const firebaseApp = initializeApp(firebaseOptions);
const rpc = createRpcClient(serverUrl, firebaseApp);

describe("RPC for users", async () => {
    const auth = getAuth(firebaseApp);
    const email = "test-user-rpc@catcolab.org";
    const password = "foobar";
    await createUserWithEmailAndPassword(auth, email, password);

    const user = auth.currentUser;
    afterAll(async () => user && (await deleteUser(user)));

    const signUpResult = await rpc.sign_up_or_sign_in.mutate();
    test.sequential("should allow sign up when authenticated", () => {
        assert.strictEqual(signUpResult.tag, "Ok");
    });

    await signOut(auth);

    const unauthorizedResult = await rpc.sign_up_or_sign_in.mutate();
    test.sequential("should prohibit sign in when unauthenticated", () => {
        assert.strictEqual(unwrapErr(unauthorizedResult).code, 401);
    });

    await signInWithEmailAndPassword(auth, email, password);

    const signInResult = await rpc.sign_up_or_sign_in.mutate();
    test.sequential("should allow sign in when authenticated", () => {
        assert.strictEqual(signInResult.tag, "Ok");
    });
});
