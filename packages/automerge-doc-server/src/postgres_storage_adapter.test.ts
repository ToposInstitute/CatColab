import { describe } from "vitest";
import { PostgresStorageAdapter } from "./postgres_storage_adapter.js";
import { Pool } from "pg";
import dotenv from "dotenv";
import { runStorageAdapterTests } from "./storage_adapter_tests.js";

dotenv.config();

async function deleteDocument(pool: Pool, documentId: string) {
    await pool.query("DELETE FROM storage WHERE key[1] = $1", [documentId]);
}

describe("PostgresStorageAdapter", () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const teardown = async () => {
        await deleteDocument(pool, "AAAAA");
        await deleteDocument(pool, "BBBBB");
        await deleteDocument(pool, "storage-adapter-id");
    };

    const setup = async () => {
        const adapter = new PostgresStorageAdapter(pool);

        return { adapter, teardown };
    };

    runStorageAdapterTests(setup);
});
