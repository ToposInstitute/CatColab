import {
    type DocHandle,
    type DocumentId,
    isValidDocumentId,
    Repo,
} from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { type FirebaseOptions, initializeApp } from "firebase/app";
import { deleteUser, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import invariant from "tiny-invariant";
import { stringify as uuidStringify, v4 } from "uuid";
import { afterAll, assert, describe, test } from "vitest";

import { createTestDocument, initTestUserAuth } from "../util/test_util.ts";
import { createRpcClient, unwrap } from "./rpc.ts";

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
    docHandle.on("change", ({ doc }) => {
        latestState = doc;
    });

    // Helper to find a document by refId in the user state
    const findDoc = (refId: string) =>
        latestState?.documents.find((d) => uuidBytesToString(d.refId) === refId);

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

    test.sequential("should sync document deletion", async () => {
        // Ensure we're signed in as the correct user for this test
        await signInWithEmailAndPassword(auth, email, password);

        // Delete (soft-delete) the first document - this sets deleted_at
        unwrap(await rpc.delete_ref.mutate(refId1));

        await waitFor(() => {
            return findDoc(refId1) === undefined;
        }, `Deleted document ${refId1} should not exist in user state`);
        const doc2 = findDoc(refId2);
        assert(doc2, `Document ${refId2} should still exist`);
    });

    test.sequential("should sync document restoration", async () => {
        // Ensure we're signed in as the correct user for this test
        await signInWithEmailAndPassword(auth, email, password);

        // Restore the deleted document - this clears deleted_at
        unwrap(await rpc.restore_ref.mutate(refId1));

        await waitFor(
            () => findDoc(refId1) !== undefined,
            `Restored document ${refId1} should exist in user state`,
        );
        const doc1 = findDoc(refId1);
        const doc2 = findDoc(refId2);
        assert(doc1);
        assert(doc2, `Document ${refId2} should still exist`);
    });

    test.sequential("should have document name as a proper string type", async () => {
        const doc1 = findDoc(refId1);
        assert(doc1, `Document ${refId1} should exist`);

        // Verify that the name is a primitive string, not an Automerge ImmutableString
        assert.strictEqual(typeof doc1.name, "string", "name should be a primitive string type");
        assert(
            Object.prototype.toString.call(doc1.name) === "[object String]",
            "name should be a native String object",
        );

        // Verify the constructor is the native String constructor
        assert.strictEqual(
            doc1.name.constructor,
            String,
            "name constructor should be native String",
        );

        // Ensure string methods work as expected on a primitive string
        assert.strictEqual(doc1.name.toUpperCase().constructor, String);
        assert.strictEqual(doc1.name.substring(0, 4).constructor, String);
    });
});
