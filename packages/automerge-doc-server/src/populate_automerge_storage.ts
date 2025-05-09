import { Repo, type RepoConfig } from "@automerge/automerge-repo";
import dotenv from "dotenv";
import pgPkg from "pg";
import { PostgresStorageAdapter } from "./postgres_storage_adapter.js";

const { Pool } = pgPkg;

dotenv.config();

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const storageAdapter = new PostgresStorageAdapter(pool);

    const config: RepoConfig = {
        sharePolicy: async () => false,
        storage: storageAdapter,
    };

    const repo = new Repo(config);

    const result = await pool.query("SELECT id, doc_id FROM refs");

    for (const { id, doc_id } of result.rows) {
        if (doc_id) {
            continue;
        }

        const snapshotQueryResult = await pool.query(
            `
            SELECT content FROM snapshots
            WHERE id = (SELECT head FROM refs WHERE id = $1)
            `,
            [id],
        );

        if (snapshotQueryResult.rows.length === 0) {
            console.error(`Failed to find snapshot for ref ${id}`);
            continue;
        }

        const snapshot = snapshotQueryResult.rows[0].content;
        const handle = repo.create(snapshot);

        if (!handle) {
            console.error(`Failed to create document for ref ${id}`);
            continue;
        }

        await pool.query("UPDATE refs SET doc_id = $2 WHERE id = $1", [id, handle.documentId]);

        console.log(`created doc for ref ${id}`);
    }

    console.log("Done!");
    process.exit(0);
}

await main();
