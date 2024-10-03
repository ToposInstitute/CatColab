import assert from "node:assert";
import { it, test } from "node:test";
import { FetchTransport, createClient } from "@rspc/client";
import { uuidv7 } from "uuidv7";

import type { Procedures } from "backend-next";

const client = createClient<Procedures>({
    // Refer to the integration your using for the correct transport.
    transport: new FetchTransport("http://localhost:8000/rpc"),
});

test("Automerge RPC", async () => {
    const refId = uuidv7();
    const docId = await client.query(["doc_id", refId]);
    await it("should get document ID", () => {
        assert(typeof docId === "string");
    });
});
