import { Repo, type RepoConfig } from "@automerge/automerge-repo";
import dotenv from "dotenv";
import pgPkg from "pg";
import { PostgresStorageAdapter } from "../postgres_storage_adapter.js";

const { Pool } = pgPkg;

dotenv.config();

/**
Fixes a problem in the automerge_storage migration where some doc_id's were not saved to the db because
the migration exited before while db changes were still pending. This problem only manifest on databases
with > 1000 documents.
**/
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

        // XXX: the docs imply that when handle.whenReady() completes the document and the document storage are in
        // sync. However using it resulted in repo.shutdown failing due to pending changes.

        // XXX: Waiting 500ms is an unreliable hack, it does not guarantee that all changes get written.
        // On AWS this migration was run manaually several times until no "created automerge doc..." logs
        // were seen.
        await sleep(500);

        console.log(`created automerge doc for snapshot ${id}`);
    }

    // XXX: no methods on repo or handle seem reliable for ensuring new documents get written to the
    // postgres storage adapter. Even if we wait on every handle.whenReady() the following check can
    // still fail:
    // if (Object.values(repo.handles).some((handle) => !handle.isReady())) {
    //     throw "Some handles are not ready, try again!";
    // }

    console.log("Done!");
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
