import { type FirebaseOptions, initializeApp } from "firebase/app";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { v4 } from "uuid";
import { assert, afterAll, describe, test } from "vitest";

import type { UserProfile } from "catcolab-api";
import { createRpcClient } from "./rpc.ts";
import { unwrap, unwrapErr } from "./test_util.ts";

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

    const defaultProfile = unwrap(await rpc.get_active_user_profile.query());
    test.sequential("should get empty profile after user creation", () => {
        assert.strictEqual(defaultProfile.username, null);
        assert.strictEqual(defaultProfile.display_name, null);
    });

    const username = `test-user-${v4()}`;
    const status = unwrap(await rpc.username_status.query(username));
    test.sequential("fresh username should be available", () => {
        assert.strictEqual(status, "Available");
    });

    const profile: UserProfile = {
        username,
        display_name: "Test user",
    };
    unwrap(await rpc.set_active_user_profile.mutate(profile));

    const updatedProfile = unwrap(await rpc.get_active_user_profile.query());
    test.sequential("should get updated data after setting user profile", () => {
        assert.deepStrictEqual(updatedProfile, profile);
    });

    const newStatus = unwrap(await rpc.username_status.query(username));
    test.sequential("username in use should be uavailable", () => {
        assert.strictEqual(newStatus, "Unavailable");
    });

    await signOut(auth);

    const unauthorizedResult1 = await rpc.sign_up_or_sign_in.mutate();
    const unauthorizedResult2 = await rpc.get_active_user_profile.query();
    const unauthorizedResult3 = await rpc.set_active_user_profile.mutate({
        username: null,
        display_name: null,
    });
    test.sequential("should prohibit user actions when unauthenticated", () => {
        assert.strictEqual(unwrapErr(unauthorizedResult1).code, 401);
        assert.strictEqual(unwrapErr(unauthorizedResult2).code, 401);
        assert.strictEqual(unwrapErr(unauthorizedResult3).code, 401);
    });

    await signInWithEmailAndPassword(auth, email, password);

    const signInResult = await rpc.sign_up_or_sign_in.mutate();
    test.sequential("should allow sign in when authenticated", () => {
        assert.strictEqual(signInResult.tag, "Ok");
    });
});
