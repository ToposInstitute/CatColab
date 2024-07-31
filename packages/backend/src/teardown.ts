import * as migration from './migration.js'
import pg from 'pg'
import * as path from 'node:path'

async function main() {
    const client = new pg.Client({
        connectionString: process.env.DATABASE_URL
    });

    await client.connect();

    await migration.teardown(client, path.resolve('./migrations'));

    await client.end();
}

await main()
