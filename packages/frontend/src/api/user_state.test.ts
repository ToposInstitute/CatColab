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
import { stringify as uuidStringify, v4 } from "uuid";
import { afterAll, assert, describe, test } from "vitest";

import {
    createChildTestDocument,
    createTestDocument,
    initTestUserAuth,
} from "../util/test_util.ts";
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

    const createdRefs: string[] = [];
    afterAll(async () => {
        for (const id of createdRefs) {
            await rpc.delete_ref.mutate(id).catch(() => {});
        }
        await deleteUser(user);
    });

    unwrap(await rpc.sign_up_or_sign_in.mutate());

    // Get the user state Automerge document.
    const userStateUrl = unwrap(await rpc.get_user_state_url.query());
    assert(isValidDocumentId(userStateUrl));

    const docHandle = (await repo.find(userStateUrl as DocumentId)) as DocHandle<UserState>;
    await docHandle.whenReady();

    // Track the latest state via change events.
    let latestState = docHandle.doc();
    docHandle.on("change", ({ doc }) => {
        latestState = doc;
    });

    // Helper to find a document by refId in the user state.
    const findDoc = (refId: string): DocInfo | undefined => latestState?.documents[refId];

    // Helper to count documents.
    const documentCount = (): number => Object.keys(latestState?.documents ?? {}).length;

    // Helper to wait for a condition with polling.
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

    // Helper to create a document and register it for cleanup.
    const createDoc = async (name: string): Promise<string> => {
        const refId = unwrap(await rpc.new_ref.mutate(createTestDocument(name)));
        createdRefs.push(refId);
        return refId;
    };

    // Helper to create a child document and register it for cleanup.
    const createChildDoc = async (name: string, parentRefId: string): Promise<string> => {
        const refId = unwrap(await rpc.new_ref.mutate(createChildTestDocument(name, parentRefId)));
        createdRefs.push(refId);
        return refId;
    };

    test("should sync document creation", async () => {
        assert(latestState);
        assert(typeof latestState.documents === "object" && latestState.documents !== null);
        const initialCount = documentCount();

        const doc1Name = `Test Document 1 - ${v4()}`;
        const refId1 = await createDoc(doc1Name);

        await waitFor(
            () => findDoc(refId1) !== undefined,
            `Document ${refId1} should exist in user state`,
        );
        const doc1 = findDoc(refId1);
        assert(doc1);
        assert.strictEqual(doc1.name, doc1Name);
        assert(
            doc1.permissions.some((p) => p.level === "Own"),
            "Document should have an Own permission",
        );

        const doc2Name = `Test Document 2 - ${v4()}`;
        const refId2 = await createDoc(doc2Name);

        await waitFor(
            () => findDoc(refId2) !== undefined,
            `Document ${refId2} should exist in user state`,
        );
        assert(findDoc(refId1), `Document ${refId1} should still exist`);
        const doc2 = findDoc(refId2);
        assert(doc2);
        assert.strictEqual(doc2.name, doc2Name);

        assert.strictEqual(documentCount(), initialCount + 2);
    });

    test("should sync document deletion and restoration", async () => {
        const name = `Test Delete/Restore - ${v4()}`;
        const refId = await createDoc(name);
        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should exist in user state`,
        );

        // Soft-delete.
        await signInWithEmailAndPassword(auth, email, password);
        unwrap(await rpc.delete_ref.mutate(refId));

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && doc.deletedAt !== null;
        }, `Deleted document ${refId} should have deletedAt set in user state`);

        // Restore.
        unwrap(await rpc.restore_ref.mutate(refId));

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && doc.deletedAt === null;
        }, `Restored document ${refId} should have deletedAt cleared in user state`);
        const restored = findDoc(refId);
        assert(restored);
        assert(restored.deletedAt === null);
    });

    test("should have document name as a proper string type", async () => {
        const name = `Test String Type - ${v4()}`;
        const refId = await createDoc(name);
        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should exist in user state`,
        );

        const doc = findDoc(refId);
        assert(doc, `Document ${refId} should exist`);
        assert.strictEqual(
            doc.name.constructor,
            String,
            "name constructor should be native String",
        );
    });

    test("should populate parent and children fields", async () => {
        const parentName = `Parent Document - ${v4()}`;
        const parentRefId = await createDoc(parentName);
        await waitFor(
            () => findDoc(parentRefId) !== undefined,
            `Parent document ${parentRefId} should exist in user state`,
        );

        const childName = `Child Document - ${v4()}`;
        const childRefId = await createChildDoc(childName, parentRefId);

        await waitFor(
            () => findDoc(childRefId) !== undefined,
            `Child document ${childRefId} should appear in user state`,
        );

        const parent = findDoc(parentRefId);
        const child = findDoc(childRefId);
        assert(parent, `Parent document ${parentRefId} should exist`);
        assert(child, `Child document ${childRefId} should exist`);

        // Child should point to parent as a UUID bytes value.
        assert(child.parent !== null, "Child should have a parent");
        assert.strictEqual(
            uuidStringify(child.parent),
            parentRefId,
            "Child parent should match parent refId",
        );

        // Parent should list child in its children array.
        await waitFor(
            () =>
                findDoc(parentRefId)?.children.some((b) => uuidStringify(b) === childRefId) ===
                true,
            `Parent document ${parentRefId} should list child ${childRefId} in children`,
        );

        const updatedParent = findDoc(parentRefId);
        assert(updatedParent, "Parent should still exist");
        assert(
            updatedParent.children.some((b) => uuidStringify(b) === childRefId),
            "Parent children should contain child ref ID",
        );
        assert(updatedParent.parent === null, "Parent document should have no parent");
    });

    test("should sync document name change via autosave", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        const name = `Test Autosave - ${v4()}`;
        const refId = await createDoc(name);
        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should exist in user state`,
        );

        const refDoc = unwrap(await rpc.get_doc.query(refId));
        assert(refDoc.tag === "Live", "Document should be live");
        assert(isValidDocumentId(refDoc.docId));

        const liveDocHandle = (await repo.find(refDoc.docId as DocumentId)) as DocHandle<{
            name: string;
        }>;
        await liveDocHandle.whenReady();

        const newName = `Updated Name - ${v4()}`;
        liveDocHandle.change((doc) => {
            doc.name = newName;
        });

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && doc.name === newName;
        }, `Document ${refId} should have updated name "${newName}" in user state`);

        const updatedDoc = findDoc(refId);
        assert(updatedDoc, "Document should still exist");
        assert.strictEqual(updatedDoc.name, newName, "Name should be updated");
    });
});
