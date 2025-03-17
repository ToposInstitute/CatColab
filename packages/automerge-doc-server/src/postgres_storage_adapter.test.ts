import {
    type SetupFn,
    runStorageAdapterTests,
} from "@automerge/automerge-repo/helpers/tests/storage-adapter-tests.js";
import dotenv from "dotenv";
import { Pool } from "pg";
import { afterEach, describe } from "vitest";
import { PostgresStorageAdapter } from "./postgres_storage_adapter.js";

dotenv.config();

async function deleteDocument(pool: Pool, documentId: string) {
    await pool.query("DELETE FROM storage WHERE key[1] = $1", [documentId]);
}

describe("PostgresStorageAdapter", () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const setup: SetupFn = async () => {
        const adapter = new PostgresStorageAdapter(pool);

        // The type signature indicates that you can optionally return a 'teardown' function which
        // will be returned at the end of a beforeEach. Functions returned from a beforeEach are cleanup
        // functions that are equivalent to afterEach, according to vitest docs. However the teardown
        // function appears to not be awaited, resulting in race conditions. This indicates at a possible
        // bug in vitest, or maybe I'm just holding it wrong. Anyway, an explicit afterEach still works.
        return { adapter };
    };

    afterEach(async () => {
        await deleteDocument(pool, "AAAAA");
        await deleteDocument(pool, "BBBBB");
        await deleteDocument(pool, "storage-adapter-id");
    });

    runStorageAdapterTests(setup);
});
