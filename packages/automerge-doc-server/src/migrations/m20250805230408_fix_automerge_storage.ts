import { Repo, type RepoConfig } from "@automerge/automerge-repo";
import dotenv from "dotenv";
import pgPkg from "pg";
import { PostgresStorageAdapter } from "../postgres_storage_adapter.js";

const { Pool } = pgPkg;

dotenv.config();

export async function fixAutomergeStorage() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const storageAdapter = new PostgresStorageAdapter(pool);

    const config: RepoConfig = {
        sharePolicy: async () => false,
        storage: storageAdapter,
    };

    const repo = new Repo(config);

    const result = await pool.query("SELECT id, content, doc_id FROM snapshots");

    for (const { id, content, doc_id } of result.rows) {
        let handle;
        try {
            handle = await repo.find(doc_id);
            continue;
        } catch {
            handle = repo.create(content);
        }

        if (!handle) {
            console.error(`Failed to create document for ref ${id}`);
            continue;
        }

        await pool.query("UPDATE snapshots SET doc_id = $2 WHERE id = $1", [id, handle.documentId]);

        await sleep(300);
        console.log(`created automerge doc for snapshot ${id}`);
    }

    // XXX: no methods on repo or handle seem reliable for ensuring new documents get written to the
    // postgres storage adapter.
    if (Object.values(repo.handles).some((handle) => !handle.isReady())) {
        throw "Some handles are not ready, try again!";
    }

    console.log("Done!");
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
