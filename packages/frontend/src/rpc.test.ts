import assert from "node:assert";
import { after, it, test } from "node:test";
import { type DocHandle, Repo, isValidDocumentId } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { FetchTransport, createClient } from "@rspc/client";
import pRetry from "p-retry";
import * as uuid from "uuid";

import type { Procedures } from "backend-next";

const client = createClient<Procedures>({
    transport: new FetchTransport("http://127.0.0.1:8000/rpc"),
});

const repo = new Repo({
    network: [new BrowserWebSocketClientAdapter("ws://127.0.0.1:8010")],
});

test("Automerge RPC", async () => {
    // XXX: Proper shutdown requires Automerge v2.
    //after(() => repo.shutdown());
    after(() => {
        setTimeout(() => process.exit(), 1000);
    });

    const content = {
        type: "model",
        name: "My model",
    };
    const refId = await client.mutation(["new_ref", content]);
    await it("should get a valid UUID", () => {
        assert(uuid.validate(refId));
    });

    const docId = await client.query(["doc_id", refId]);
    await it("should get a valid document ID", () => {
        assert(isValidDocumentId(docId));
    });

    const newDocId = await client.query(["doc_id", refId]);
    await it("should get the same document ID as before", () => {
        assert.strictEqual(newDocId, docId);
    });

    if (!isValidDocumentId(docId)) {
        return;
    }
    const docHandle = repo.find(docId) as DocHandle<typeof content>;
    const doc = await docHandle.doc();

    await it("should get the original document data", () => {
        assert.deepStrictEqual(doc, content);
    });

    const newName = "Renamed model";
    docHandle.change((data) => {
        data.name = newName;
    });

    await it("should update content in database", async () => {
        const check = async () => {
            const newContent = await client.query(["head_snapshot", refId]);
            if (newContent.name !== newName) {
                throw new Error();
            }
        };
        await pRetry(check, { retries: 3, minTimeout: 10 });
    });
});
