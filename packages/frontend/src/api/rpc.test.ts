import { type DocHandle, Repo, isValidDocumentId } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { type FirebaseOptions, initializeApp } from "firebase/app";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import * as uuid from "uuid";
import { assert, afterAll, describe, test } from "vitest";

import type { RpcResult } from "catcolab-api";
import { createRpcClient } from "./rpc.ts";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const repoUrl = import.meta.env.VITE_AUTOMERGE_REPO_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const firebaseApp = initializeApp(firebaseOptions);
const rpc = createRpcClient(serverUrl, firebaseApp);

const repo = new Repo({
    network: [new BrowserWebSocketClientAdapter(repoUrl)],
});

// XXX: Proper shutdown requires Automerge v2.
//afterAll(() => repo.shutdown());

describe("RPC for Automerge documents", async () => {
    const content = {
        type: "model",
        name: "My model",
    };
    const refId = unwrap(await rpc.new_ref.mutate({ content }));
    test.sequential("should get a valid ref UUID", () => {
        assert(uuid.validate(refId));
    });

    const refDoc = unwrap(await rpc.get_doc.query(refId));
    assert(refDoc.tag === "Live");
    test.sequential("should get a valid document ID", () => {
        assert(isValidDocumentId(refDoc.docId));
        assert.strictEqual(refDoc.permissions.anyone, "Own");
        assert.strictEqual(refDoc.permissions.user, null);
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

    if (!isValidDocumentId(refDoc.docId)) {
        return;
    }
    const docHandle = repo.find(refDoc.docId) as DocHandle<typeof content>;
    const doc = await docHandle.doc();

    test.sequential("should get the original document data", () => {
        assert.deepStrictEqual(doc, content);
    });

    const newName = "Renamed model";
    docHandle.change((data) => {
        data.name = newName;
    });

    test.sequential("should autosave to the database", { timeout: 1000, retry: 5 }, async () => {
        const newContent = unwrap(await rpc.head_snapshot.query(refId)) as typeof content;
        assert.strictEqual(newContent.name, newName);
    });
});

describe("Authorized RPC", async () => {
    const auth = getAuth(firebaseApp);
    const email = "test@catcolab.org";
    const password = "foobar";
    await createUserWithEmailAndPassword(auth, email, password);

    const user = auth.currentUser;
    afterAll(async () => user && (await deleteUser(user)));

    const signUpResult = await rpc.sign_up_or_sign_in.mutate();
    test.sequential("should allow sign up when authenticated", () => {
        assert.strictEqual(signUpResult.tag, "Ok");
    });

    const content = {
        type: "model",
        name: "My private model",
    };
    const privateId = unwrap(await rpc.new_ref.mutate({ content }));
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
        assert.strictEqual(refDoc.permissions.anyone, null);
        assert.strictEqual(refDoc.permissions.user, "Own");
    });

    const readonlyId = unwrap(
        await rpc.new_ref.mutate({
            content: {
                type: "model",
                name: "My readonly model",
            },
            permissions: {
                anyone: "Read",
            },
        }),
    );

    await signOut(auth);

    const unauthorizedResult = await rpc.sign_up_or_sign_in.mutate();
    test.sequential("should prohibit sign in when unauthenticated", () => {
        assert.strictEqual(unwrapErr(unauthorizedResult).code, 401);
    });

    const forbiddenResult1 = await rpc.head_snapshot.query(privateId);
    const forbiddenResult2 = await rpc.get_doc.query(privateId);
    test.sequential("should prohibit document access when unauthenticated", () => {
        assert.strictEqual(unwrapErr(forbiddenResult1).code, 403);
        assert.strictEqual(unwrapErr(forbiddenResult2).code, 403);
    });

    const readonlyDoc = unwrap(await rpc.get_doc.query(readonlyId));
    test.sequential("should allow read-only document access when unauthenticated", () => {
        assert.strictEqual(readonlyDoc.tag, "Readonly");
    });

    await signInWithEmailAndPassword(auth, email, password);

    const signInResult = await rpc.sign_up_or_sign_in.mutate();
    test.sequential("should allow sign in when authenticated", () => {
        assert.strictEqual(signInResult.tag, "Ok");
    });
});

function unwrap<T>(result: RpcResult<T>): T {
    assert.strictEqual(result.tag, "Ok");
    return (result as RpcResult<T> & { tag: "Ok" }).content;
}

function unwrapErr<T>(result: RpcResult<T>): { code: number; message: string } {
    assert.strictEqual(result.tag, "Err");
    return result as RpcResult<T> & { tag: "Err" };
}
