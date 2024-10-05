import assert from "node:assert";
import { it, test } from "node:test";
import { isValidDocumentId } from "@automerge/automerge-repo";
import { FetchTransport, createClient } from "@rspc/client";
import * as uuid from "uuid";

import type { Procedures } from "backend-next";

const client = createClient<Procedures>({
    // Refer to the integration your using for the correct transport.
    transport: new FetchTransport("http://localhost:8000/rpc"),
});

test("Automerge RPC", async () => {
    const content = {
        type: "model",
        name: "Test model",
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
        assert(newDocId === docId);
    });
});
