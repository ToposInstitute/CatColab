import {
    type DocHandle,
    type DocumentId,
    isValidDocumentId,
    Repo,
} from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import type { DocInfo, UserState } from "catcolab-api/src/user_state";
import { type FirebaseOptions, initializeApp } from "firebase/app";
import { deleteUser, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import invariant from "tiny-invariant";
import { v4 } from "uuid";
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

    const docHandle = (await repo.find(userStateUrl as DocumentId)) as DocHandle<UserState>;

    // Track the latest state via change events
    let latestState = docHandle.doc();
    docHandle.on("change", ({ doc }) => {
        latestState = doc;
    });

    // Helper to find a document by refId in the user state
    const findDoc = (refId: string): DocInfo | undefined => latestState?.documents[refId];

    // Helper to count documents
    const documentCount = (): number => Object.keys(latestState?.documents ?? {}).length;

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
    const initialCount = documentCount();

    test.sequential("should have a valid initial state with documents map", () => {
        assert(latestState);
        assert(typeof latestState.documents === "object" && latestState.documents !== null);
    });

    // Create first document
    const doc1Name = `Test Document 1 - ${v4()}`;
    const refId1: string = unwrap(await rpc.new_ref.mutate(createTestDocument(doc1Name)));

    test.sequential("should sync first document after creation", async () => {
        await waitFor(
            () => findDoc(refId1) !== undefined,
            `Document ${refId1} should exist in user state`,
        );
        const doc = findDoc(refId1);
        assert(doc);
        assert.strictEqual(doc.name, doc1Name);
        assert(
            doc.permissions.some((p) => p.level === "Own"),
            "Document should have an Own permission",
        );
    });

    // Create second document
    const doc2Name = `Test Document 2 - ${v4()}`;
    const refId2: string = unwrap(await rpc.new_ref.mutate(createTestDocument(doc2Name)));

    test.sequential("should sync second document after creation", async () => {
        await waitFor(
            () => findDoc(refId2) !== undefined,
            `Document ${refId2} should exist in user state`,
        );
        const doc1 = findDoc(refId1);
        const doc2 = findDoc(refId2);
        assert(doc1, `Document ${refId1} should still exist`);
        assert(doc2);
        assert.strictEqual(doc2.name, doc2Name);

        // Verify count increased by 2
        assert(latestState);
        assert.strictEqual(documentCount(), initialCount + 2);
    });

    test.sequential("should sync document deletion", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        // Delete (soft-delete) the first document - this sets deleted_at
        unwrap(await rpc.delete_ref.mutate(refId1));

        await waitFor(() => {
            const doc = findDoc(refId1);
            return doc !== undefined && doc.deletedAt !== null;
        }, `Deleted document ${refId1} should have deletedAt set in user state`);
        const doc2 = findDoc(refId2);
        assert(doc2, `Document ${refId2} should still exist`);
        assert(doc2.deletedAt === null, `Document ${refId2} should not be deleted`);
    });

    test.sequential("should sync document restoration", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        // Restore the deleted document - this clears deleted_at
        unwrap(await rpc.restore_ref.mutate(refId1));

        await waitFor(() => {
            const doc = findDoc(refId1);
            return doc !== undefined && doc.deletedAt === null;
        }, `Restored document ${refId1} should have deletedAt cleared in user state`);
        const doc1 = findDoc(refId1);
        const doc2 = findDoc(refId2);
        assert(doc1);
        assert(doc1.deletedAt === null, `Document ${refId1} should not be deleted after restore`);
        assert(doc2, `Document ${refId2} should still exist`);
    });

    test.sequential("should have document name as a proper string type", async () => {
        const doc1 = findDoc(refId1);
        assert(doc1, `Document ${refId1} should exist`);

        // Verify the constructor is the native String constructor
        assert.strictEqual(
            doc1.name.constructor,
            String,
            "name constructor should be native String",
        );
    });

    test.sequential("should sync document name change via autosave", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        // Get the live document handle to edit it
        const refDoc = unwrap(await rpc.get_doc.query(refId1));
        assert(refDoc.tag === "Live", "Document should be live");
        assert(isValidDocumentId(refDoc.docId));

        const liveDocHandle = (await repo.find(refDoc.docId as DocumentId)) as DocHandle<{
            name: string;
        }>;
        await liveDocHandle.whenReady();

        // Get original name from user state
        const originalDoc = findDoc(refId1);
        assert(originalDoc, "Document should exist in user state");

        // Change the document name via Automerge (triggers autosave)
        const newName = `Updated Name - ${v4()}`;
        liveDocHandle.change((doc) => {
            doc.name = newName;
        });

        // Wait for the name change to propagate to user state via autosave notification
        await waitFor(() => {
            const doc = findDoc(refId1);
            return doc !== undefined && doc.name === newName;
        }, `Document ${refId1} should have updated name "${newName}" in user state`);

        const updatedDoc = findDoc(refId1);
        assert(updatedDoc, "Document should still exist");
        assert.strictEqual(updatedDoc.name, newName, "Name should be updated");
    });
});
