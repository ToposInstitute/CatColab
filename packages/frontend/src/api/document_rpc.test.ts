import { type DocHandle, Repo, isValidDocumentId } from "@automerge/automerge-repo";
import { type FirebaseOptions, initializeApp } from "firebase/app";
import { deleteUser, getAuth, signOut } from "firebase/auth";
import * as uuid from "uuid";
import { assert, afterAll, describe, test } from "vitest";

import type { Document } from "catlog-wasm";
import { createTestDocument, initTestUserAuth } from "../util/test_util.ts";
import { createRpcClient, unwrap, unwrapErr } from "./rpc.ts";
import { LoggedWebSocketAdapter } from "./logged_websocket_adapter.ts";

const serverUrl = import.meta.env.VITE_SERVER_URL;
// const repoUrl = import.meta.env.VITE_AUTOMERGE_REPO_URL;
const repoUrl = "ws://127.0.0.1:8010";
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

console.log(`[Test] Initializing test with serverUrl: ${serverUrl}, repoUrl: ${repoUrl}`);

const firebaseApp = initializeApp(firebaseOptions);
const rpc = createRpcClient(serverUrl, firebaseApp);

const wsAdapter = new LoggedWebSocketAdapter(repoUrl);
const repo = new Repo({
    network: [wsAdapter],
});

// @ts-ignore
// Log repo events
repo.on("peer", (event) => {
    console.log(`[Test] Repo 'peer' event:`, event);
});

repo.on("document", (event) => {
    console.log(`[Test] Repo 'document' event:`, event);
});

console.log("peers 1: ", repo.peers);
console.log("[Test] Adapter isReady:", wsAdapter.isReady());
console.log("[Test] Repo network adapters:", repo.networkSubsystem.adapters);

// XXX: Proper shutdown requires Automerge v2.
//afterAll(() => repo.shutdown());

describe("RPC for Automerge documents", async () => {
    console.log("peers 2: ", repo.peers);
    const content = createTestDocument("My model");
    const refId = unwrap(await rpc.new_ref.mutate(content));
    test.sequential("should get a valid ref UUID", () => {
        assert(uuid.validate(refId));
    });

    const refDoc = unwrap(await rpc.get_doc.query(refId));
    assert(refDoc.tag === "Live");
    test.sequential("should get a valid document ID", () => {
        assert(isValidDocumentId(refDoc.docId));
        assert.deepStrictEqual(refDoc.permissions, {
            anyone: "Own",
            user: null,
            users: null,
        });
    });

    const newRefDoc = unwrap(await rpc.get_doc.query(refId));
    test.sequential("should get the same document ID as before", () => {
        assert(newRefDoc.tag === "Live");
        assert.strictEqual(newRefDoc.docId, refDoc.docId);
    });

    const result = await rpc.get_doc.query(uuid.v7());
    test("should get 404 when document does not exist", async () => {
        assert(result.tag === "Err" && result.code === 404);
    });

    test("should reject invalid documents", async () => {
        const invalidDoc = {
            type: "model",
            name: "Invalid model",
        };
        const invalidResult = await rpc.new_ref.mutate(invalidDoc);
        assert(invalidResult.tag === "Err");
        assert.strictEqual(invalidResult.code, 400);
    });

    if (!isValidDocumentId(refDoc.docId)) {
        return;
    }
    console.log("peers 3: ", repo.peers);
    console.log("[Test] About to wait for document to be available");
    console.log("[Test] Document ID we're looking for:", refDoc.docId);
    console.log("[Test] Adapter isReady:", wsAdapter.isReady());
    console.log("[Test] WebSocket readyState:", wsAdapter.socket?.readyState);
    console.log("[Test] Remote peer ID:", wsAdapter.remotePeerId);

    // Wait 10 seconds for the document to be available in the repo
    await new Promise((resolve) => setTimeout(resolve, 10000));

    console.log("[Test] After wait - peers:", repo.peers);
    console.log("[Test] After wait - adapter isReady:", wsAdapter.isReady());
    console.log("[Test] After wait - WebSocket readyState:", wsAdapter.socket?.readyState);
    console.log("[Test] After wait - Remote peer ID:", wsAdapter.remotePeerId);

    const docHandle = (await repo.find(refDoc.docId)) as DocHandle<Document>;
    console.log("[Test] DocHandle obtained, state:", docHandle.state);
    const doc = docHandle.doc();
    console.log("[Test] Document retrieved:", doc);

    test.sequential("should get the original document data", () => {
        assert.deepStrictEqual(doc, content as unknown as Document);
    });

    const newName = "Renamed model";
    docHandle.change((data) => {
        data.name = newName;
    });

    test.sequential("should autosave to the database", { timeout: 1000, retry: 5 }, async () => {
        const newContent = unwrap(await rpc.head_snapshot.query(refId)) as unknown as Document;
        assert.strictEqual(newContent.name, newName);
    });
});

describe("Authorized RPC", async () => {
    const auth = getAuth(firebaseApp);
    const email = "test-document-rpc@catcolab.org";
    const password = "foobar";
    await initTestUserAuth(auth, email, password);

    const user = auth.currentUser;
    afterAll(async () => user && (await deleteUser(user)));

    unwrap(await rpc.sign_up_or_sign_in.mutate());

    const content = createTestDocument("My private model");
    const privateId = unwrap(await rpc.new_ref.mutate(content));
    test.sequential("should get a valid ref UUID when authenticated", () => {
        assert(uuid.validate(privateId));
    });

    const fetchedContent = unwrap(await rpc.head_snapshot.query(privateId));
    test.sequential("should get document content when authenticated", () => {
        assert.deepStrictEqual(fetchedContent, content);
    });

    const refDoc = unwrap(await rpc.get_doc.query(privateId));
    test.sequential("should get a live document when authenticated", () => {
        assert(refDoc.tag === "Live");
        assert(isValidDocumentId(refDoc.docId));
        assert.deepStrictEqual(refDoc.permissions, {
            anyone: null,
            user: "Own",
            users: [],
        });
    });

    const readonlyId = unwrap(await rpc.new_ref.mutate(createTestDocument("My readonly model")));
    unwrap(
        await rpc.set_permissions.mutate(readonlyId, {
            anyone: "Read",
            users: {},
        }),
    );

    await signOut(auth);

    const forbiddenResult1 = await rpc.head_snapshot.query(privateId);
    const forbiddenResult2 = await rpc.get_doc.query(privateId);
    test.sequential("should prohibit document access when unauthenticated", () => {
        assert.strictEqual(unwrapErr(forbiddenResult1).code, 403);
        assert.strictEqual(unwrapErr(forbiddenResult2).code, 403);
    });

    const readonlyDoc = unwrap(await rpc.get_doc.query(readonlyId));
    test.sequential("should allow read-only document access when unauthenticated", () => {
        assert.strictEqual(readonlyDoc.tag, "Readonly");
        assert.deepStrictEqual(readonlyDoc.permissions, {
            anyone: "Read",
            user: null,
            users: null,
        });
    });
});
