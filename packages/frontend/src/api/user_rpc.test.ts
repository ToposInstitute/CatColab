import { type FirebaseOptions, initializeApp } from "firebase/app";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import invariant from "tiny-invariant";
import { v4 } from "uuid";
import { assert, afterAll, describe, test } from "vitest";

import type { UserProfile } from "catcolab-api";
import { createRpcClient } from "./rpc.ts";
import { unwrap, unwrapErr } from "./test_util.ts";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const firebaseApp = initializeApp(firebaseOptions);
const rpc = createRpcClient(serverUrl, firebaseApp);

describe("RPC for user profiles", async () => {
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
        assert.strictEqual(defaultProfile.displayName, null);
    });

    const username = `test-user-${v4()}`;
    const status = unwrap(await rpc.username_status.query(username));
    test.sequential("fresh username should be available", () => {
        assert.strictEqual(status, "Available");
    });

    const profile: UserProfile = {
        username,
        displayName: "Test user",
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
        displayName: null,
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

describe("Sharing documents between users", async () => {
    // Set up account for the user to share with (the "sharee").
    const auth = getAuth(firebaseApp);
    const shareeEmail = "test-user-sharee@catcolab.org";
    const password = "foobar";
    await createUserWithEmailAndPassword(auth, shareeEmail, password);

    const shareeUser = auth.currentUser;
    invariant(shareeUser);
    afterAll(async () => await deleteUser(shareeUser));

    unwrap(await rpc.sign_up_or_sign_in.mutate());

    const shareeUsername = `sharee-${v4()}`;
    unwrap(
        await rpc.set_active_user_profile.mutate({
            username: shareeUsername,
            displayName: "Sharee",
        }),
    );

    await signOut(auth);

    // Set up account for the user who will share the document (the "sharer").
    const sharerEmail = "test-user-sharer@catcolab.org";
    await createUserWithEmailAndPassword(auth, sharerEmail, password);

    const sharerUser = auth.currentUser;
    invariant(sharerUser);
    afterAll(async () => await deleteUser(sharerUser));

    unwrap(await rpc.sign_up_or_sign_in.mutate());

    // Create the document to be shared.
    const refId = unwrap(
        await rpc.new_ref.mutate({
            type: "model",
            name: "My shared model",
        }),
    );

    // Share the document with read-only permissions.
    unwrap(
        await rpc.set_permissions.mutate(refId, [
            {
                userId: shareeUser.uid,
                level: "Read",
            },
        ]),
    );

    const permissions = unwrap(await rpc.get_permissions.query(refId));
    test.sequential("should get updated permissions", () => {
        assert.strictEqual(permissions.anyone, null);
        assert.strictEqual(permissions.user, "Own");
        assert.deepStrictEqual(permissions.users, [
            {
                user: {
                    id: shareeUser.uid,
                    username: shareeUsername,
                    displayName: "Sharee",
                },
                level: "Read",
            },
        ]);
    });

    await signOut(auth);
    await signInWithEmailAndPassword(auth, shareeEmail, password);

    const readonlyDoc = unwrap(await rpc.get_doc.query(refId));
    test.sequential("should allow read-only document access when unauthenticated", () => {
        assert.strictEqual(readonlyDoc.tag, "Readonly");
        assert.strictEqual(readonlyDoc.permissions.anyone, null);
        assert.strictEqual(readonlyDoc.permissions.user, "Read");
    });

    await signOut(auth);

    const forbiddenResult = await rpc.get_doc.query(refId);
    test.sequential("should prohibit document access when logged out", () => {
        assert.strictEqual(unwrapErr(forbiddenResult).code, 403);
    });
});
