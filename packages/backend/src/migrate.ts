import * as migration from './migration.js'
import pg from 'pg'
import * as path from 'node:path'
import { getDatabaseUrl } from './database_url.js';

async function main() {
    const client = new pg.Client({
        connectionString: getDatabaseUrl()
    });

    await client.connect();

    await migration.migrate(client, path.resolve('./migrations'));

    await client.end();
}

await main()
