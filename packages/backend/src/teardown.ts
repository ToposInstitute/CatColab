import * as path from "node:path";
import pg from "pg";
import { getDatabaseUrl } from "./database_url.js";
import * as migration from "./migration.js";

async function main() {
    const client = new pg.Client({
        connectionString: getDatabaseUrl(),
    });

    await client.connect();

    await migration.teardown(client, path.resolve("./migrations"));

    await client.end();
}

await main();
