import { type DocHandle, Repo, isValidDocumentId } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import * as uuid from "uuid";
import { assert, describe, test } from "vitest";

import type { RpcResult } from "catcolab-api/src/RpcResult.ts";
import { createRPCClient } from "./api.ts";

const serverUrl: string = import.meta.env.VITE_SERVER_URL;
const repoUrl: string = import.meta.env.VITE_AUTOMERGE_REPO_URL;

const rpc = createRPCClient(serverUrl);
const repo = new Repo({
    network: [new BrowserWebSocketClientAdapter(repoUrl)],
});

// XXX: Proper shutdown requires Automerge v2.
//afterAll(() => repo.shutdown());

function unwrap<T>(result: RpcResult<T>): T {
    assert(result.tag === "Ok");
    return result.content;
}

describe("Document RPC", async () => {
    const content = {
        type: "model",
        name: "My model",
    };
    const refId = unwrap(await rpc.new_ref.mutate(content));
    test.sequential("should get a valid UUID", () => {
        assert(uuid.validate(refId));
    });

    const docId = unwrap(await rpc.doc_id.query(refId));
    test.sequential("should get a valid document ID", () => {
        assert(isValidDocumentId(docId));
    });

    const newDocId = unwrap(await rpc.doc_id.query(refId));
    test.sequential("should get the same document ID as before", () => {
        assert.strictEqual(newDocId, docId);
    });

    const result = await rpc.doc_id.query(uuid.v7());
    test("should get 404 when document does not exist", async () => {
        assert(result.tag === "Err" && result.code === 404);
    });

    if (!isValidDocumentId(docId)) {
        return;
    }
    const docHandle = repo.find(docId) as DocHandle<typeof content>;
    const doc = await docHandle.doc();

    test.sequential("should get the original document data", () => {
        assert.deepStrictEqual(doc, content);
    });

    const newName = "Renamed model";
    docHandle.change((data) => {
        data.name = newName;
    });

    test.sequential("should update content in database", { timeout: 1000, retry: 5 }, async () => {
        const newContent = unwrap(await rpc.head_snapshot.query(refId)) as typeof content;
        assert.strictEqual(newContent.name, newName);
    });
});
