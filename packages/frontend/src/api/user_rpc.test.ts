import {
    type DocHandle,
    type DocumentId,
    isValidDocumentId,
    Repo,
} from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { type FirebaseOptions, initializeApp } from "firebase/app";
import { deleteUser, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import invariant from "tiny-invariant";
import { stringify as uuidStringify, v4 } from "uuid";
import { afterAll, assert, describe, test } from "vitest";

import type { RefStub, UserProfile } from "catcolab-api";
import { createTestDocument, initTestUserAuth } from "../util/test_util.ts";
import { createRpcClient, unwrap, unwrapErr } from "./rpc.ts";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const repoUrl = import.meta.env.VITE_AUTOMERGE_REPO_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const firebaseApp = initializeApp(firebaseOptions);
const rpc = createRpcClient(serverUrl, firebaseApp);

const repo = new Repo({
    network: [new BrowserWebSocketClientAdapter(repoUrl)],
});

/** Shape of the user state stored in Automerge (with binary UUIDs). */
type UserStateDoc = {
    documents: Array<{
        name: string;
        typeName: string;
        refId: Uint8Array; // UUID stored as bytes in Automerge
        permissionLevel: string;
        owner: { id: string; username: string | null; displayName: string | null } | null;
        createdAt: number;
    }>;
};

/** Convert a Uint8Array UUID to a string. */
const uuidBytesToString = (bytes: Uint8Array): string => {
    return uuidStringify(bytes);
};

describe("RPC for user profiles", async () => {
    const auth = getAuth(firebaseApp);
    const email = "test-user-rpc@catcolab.org";
    const password = "foobar";
    await initTestUserAuth(auth, email, password);

    const user = auth.currentUser;

    afterAll(async () => user && (await deleteUser(user)));

    const signUpResult = await rpc.sign_up_or_sign_in.mutate();
    test.sequential("should allow sign up when authenticated", () => {
        assert.strictEqual(signUpResult.tag, "Ok");
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

    const summary = unwrap(await rpc.user_by_username.query(username));
    test.sequential("user summary should be retrieved", () => {
        assert.strictEqual(summary?.username, username);
        assert.strictEqual(summary?.displayName, "Test user");
    });

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

    const userStateUrl = unwrap(await rpc.get_user_state_url.query());
    test.sequential("should get a valid automerge document ID for user state", () => {
        assert(isValidDocumentId(userStateUrl));
    });

    const userStateUrl2 = unwrap(await rpc.get_user_state_url.query());
    test.sequential("should get the same user state URL on subsequent calls", () => {
        assert.strictEqual(userStateUrl2, userStateUrl);
    });

    await signOut(auth);

    const unauthorizedUserStateResult = await rpc.get_user_state_url.query();
    test.sequential("should prohibit getting user state URL when unauthenticated", () => {
        assert.strictEqual(unwrapErr(unauthorizedUserStateResult).code, 401);
    });
});

describe("Sharing documents between users", async () => {
    // Set up account for the user to share with (the "sharee").
    const auth = getAuth(firebaseApp);
    const shareeEmail = "test-user-sharee@catcolab.org";
    const password = "foobar";
    await initTestUserAuth(auth, shareeEmail, password);

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
    await initTestUserAuth(auth, sharerEmail, password);

    const sharerUser = auth.currentUser;
    invariant(sharerUser);
    afterAll(async () => await deleteUser(sharerUser));

    unwrap(await rpc.sign_up_or_sign_in.mutate());

    // Create the document to be shared.
    const refId = unwrap(await rpc.new_ref.mutate(createTestDocument("My shared model")));

    // Share the document with read-only permissions.
    unwrap(
        await rpc.set_permissions.mutate(refId, {
            anyone: null,
            users: {
                [shareeUser.uid]: "Read",
            },
        }),
    );

    const permissions = unwrap(await rpc.get_permissions.query(refId));
    test.sequential("should get updated permissions", () => {
        assert.deepStrictEqual(permissions, {
            anyone: null,
            user: "Own",
            users: [
                {
                    user: {
                        id: shareeUser.uid,
                        username: shareeUsername,
                        displayName: "Sharee",
                    },
                    level: "Read",
                },
            ],
        });
    });

    await signOut(auth);

    // Access the document as the sharee.
    await signInWithEmailAndPassword(auth, shareeEmail, password);

    const readonlyDoc = unwrap(await rpc.get_doc.query(refId));
    test.sequential("should allow read-only document access when logged in", () => {
        assert.strictEqual(readonlyDoc.tag, "Readonly");
        assert.deepStrictEqual(readonlyDoc.permissions, {
            anyone: null,
            user: "Read",
            users: null,
        });
    });

    const forbiddenResult1 = await rpc.set_permissions.mutate(refId, {
        anyone: null,
        users: {
            [shareeUser.uid]: "Write",
        },
    });
    test.sequential("should prohibit upgrading own permissions", () => {
        assert.strictEqual(unwrapErr(forbiddenResult1).code, 403);
    });

    await signOut(auth);

    const forbiddenResult2 = await rpc.get_doc.query(refId);
    test.sequential("should prohibit document access when logged out", () => {
        assert.strictEqual(unwrapErr(forbiddenResult2).code, 403);
    });
});

describe("User state Automerge document", async () => {
    const auth = getAuth(firebaseApp);
    const email = "test-user-state-doc@catcolab.org";
    const password = "foobar";
    await initTestUserAuth(auth, email, password);

    const user = auth.currentUser;
    invariant(user);
    afterAll(async () => await deleteUser(user));

    unwrap(await rpc.sign_up_or_sign_in.mutate());

    // Get the user state Automerge document
    const userStateUrl = unwrap(await rpc.get_user_state_url.query());
    assert(isValidDocumentId(userStateUrl));

    const docHandle = (await repo.find(userStateUrl as DocumentId)) as DocHandle<UserStateDoc>;

    // Track the latest state via change events
    let latestState: UserStateDoc | undefined = docHandle.doc();
    let changeCount = 0;
    docHandle.on("change", ({ doc }) => {
        changeCount++;
        console.log(`[change #${changeCount}] doc_count=${doc.documents.length}`);
        latestState = doc;
    });

    // Helper to find a document by refId in the user state
    const findDoc = (refId: string) => {
        return latestState?.documents.find((d) => uuidBytesToString(d.refId) === refId);
    };

    // Helper to wait for a condition with polling
    const waitFor = async (
        condition: () => boolean,
        message: string,
        timeoutMs = 10000,
        intervalMs = 100,
    ) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (condition()) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        assert(condition(), message);
    };

    // Record the initial count of documents (may include public docs from other tests)
    const initialCount = latestState?.documents.length ?? 0;

    test.sequential("should have a valid initial state with documents array", () => {
        assert(latestState);
        assert(Array.isArray(latestState.documents));
    });

    // Create first document
    const doc1Name = `Test Document 1 - ${v4()}`;
    const refId1 = unwrap(await rpc.new_ref.mutate(createTestDocument(doc1Name)));

    test.sequential("should sync first document after creation", async () => {
        await waitFor(
            () => findDoc(refId1) !== undefined,
            `Document ${refId1} should exist in user state`,
        );
        const doc = findDoc(refId1);
        assert(doc);
        assert.strictEqual(String(doc.name), doc1Name);
        assert.strictEqual(String(doc.permissionLevel), "Own");
    });

    // Create second document
    const doc2Name = `Test Document 2 - ${v4()}`;
    const refId2 = unwrap(await rpc.new_ref.mutate(createTestDocument(doc2Name)));

    test.sequential("should sync second document after creation", async () => {
        await waitFor(
            () => findDoc(refId2) !== undefined,
            `Document ${refId2} should exist in user state`,
        );
        const doc1 = findDoc(refId1);
        const doc2 = findDoc(refId2);
        assert(doc1, `Document ${refId1} should still exist`);
        assert(doc2);
        assert.strictEqual(String(doc2.name), doc2Name);

        // Verify count increased by 2
        assert(latestState);
        assert.strictEqual(latestState.documents.length, initialCount + 2);
    });

    // Delete (soft-delete) the first document - this sets deleted_at
    unwrap(await rpc.delete_ref.mutate(refId1));
    console.log(
        `[test] Deleted refId1=${refId1}, current doc_count=${latestState?.documents.length}`,
    );

    test.sequential("should sync document deletion", async () => {
        console.log(
            `[test] Starting deletion wait, doc_count=${latestState?.documents.length}, doc1_exists=${findDoc(refId1) !== undefined}`,
        );
        await waitFor(() => {
            const exists = findDoc(refId1) !== undefined;
            if (exists) {
                console.log(`[poll] doc1 still exists, doc_count=${latestState?.documents.length}`);
            }
            return !exists;
        }, `Deleted document ${refId1} should not exist in user state`);
        const doc2 = findDoc(refId2);
        assert(doc2, `Document ${refId2} should still exist`);
    });

    // Restore the deleted document - this clears deleted_at
    unwrap(await rpc.restore_ref.mutate(refId1));

    test.sequential("should sync document restoration", async () => {
        await waitFor(
            () => findDoc(refId1) !== undefined,
            `Restored document ${refId1} should exist in user state`,
        );
        const doc1 = findDoc(refId1);
        const doc2 = findDoc(refId2);
        assert(doc1);
        assert(doc2, `Document ${refId2} should still exist`);
    });
});
