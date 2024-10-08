import { type DocHandle, Repo, isValidDocumentId } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import type { RSPCError } from "@rspc/client";
import * as uuid from "uuid";
import { assert, describe, test } from "vitest";

import { createRPCClient } from "./api.ts";

const serverUrl: string = import.meta.env.VITE_SERVER_URL;
const repoUrl: string = import.meta.env.VITE_AUTOMERGE_REPO_URL;

const client = createRPCClient(serverUrl);
const repo = new Repo({
    network: [new BrowserWebSocketClientAdapter(repoUrl)],
});

// XXX: Proper shutdown requires Automerge v2.
//afterAll(() => repo.shutdown());

describe("Document RPC", async () => {
    const content = {
        type: "model",
        name: "My model",
    };
    const refId = await client.mutation(["new_ref", content]);
    test.sequential("should get a valid UUID", () => {
        assert(uuid.validate(refId));
    });

    const docId = await client.query(["doc_id", refId]);
    test.sequential("should get a valid document ID", () => {
        assert(isValidDocumentId(docId));
    });

    const newDocId = await client.query(["doc_id", refId]);
    test.sequential("should get the same document ID as before", () => {
        assert.strictEqual(newDocId, docId);
    });

    const badRefId = uuid.v7();
    test("should get 404 when document does not exist", async () => {
        try {
            await client.query(["doc_id", badRefId]);
        } catch (err) {
            assert.strictEqual((err as RSPCError).code, 404);
            return;
        }
        assert.fail();
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
        const newContent = await client.query(["head_snapshot", refId]);
        assert.strictEqual(newContent.name, newName);
    });
});
