import assert from "node:assert";
import { it, test } from "node:test";
import { FetchTransport, createClient } from "@rspc/client";
import * as uuid from "uuid";

import type { Procedures } from "backend-next";

const client = createClient<Procedures>({
    // Refer to the integration your using for the correct transport.
    transport: new FetchTransport("http://localhost:8000/rpc"),
});

test("Automerge RPC", async () => {
    const { refId, docId } = await client.mutation(["new_ref", "model"]);
    await it("should get valid UUID", () => {
        assert(uuid.validate(refId));
        assert(typeof docId === "string");
    });

    const newDocId = await client.query(["doc_id", refId]);
    await it("should get document ID", () => {
        assert(newDocId === docId);
    });
});
