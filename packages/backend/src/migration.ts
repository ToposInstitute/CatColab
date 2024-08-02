import * as fs from "node:fs/promises";
import * as path from "node:path";
import type pg from "pg";

const migration_schema = `
    CREATE TABLE IF NOT EXISTS migrations (name TEXT, PRIMARY KEY (name));
`;

const get_migrations_query = `
    SELECT name FROM migrations
`;

const add_migration_query = `
    INSERT INTO migrations(name) VALUES($1)
`;

const remove_migration_query = `
    DELETE FROM migrations WHERE name = $1
`;

export async function migrate(
    client: pg.Client | pg.Pool,
    migration_dir_path: string,
    teardown = false,
) {
    const verb = teardown ? "tearing down" : "migrating";
    console.info(`${verb} database`);
    await client.query(migration_schema);
    const dir = await fs.opendir(migration_dir_path);
    const migrations_query = await client.query(get_migrations_query);
    const migrations = migrations_query.rows.map((row) => row.name);
    const todos: string[] = [];
    for await (const f of dir) {
        if (f.isFile()) {
            const isundo = !(f.name.match(/.undo.sql$/) === null);
            if (teardown) {
                if (isundo) {
                    const name = f.name.replace(/.undo.sql$/, ".sql");
                    if (migrations.includes(name)) {
                        todos.push(f.name);
                    } else {
                        console.info(`haven't applied migration: ${f.name}`);
                    }
                }
            } else {
                if (!isundo) {
                    if (!migrations.includes(f.name)) {
                        todos.push(f.name);
                    } else {
                        console.info(`already applied migration: ${f.name}`);
                    }
                }
            }
        }
    }
    for (const todo of todos.sort((a, b) => (teardown ? b.localeCompare(a) : a.localeCompare(b)))) {
        const contents = await fs.readFile(path.join(migration_dir_path, todo), {
            encoding: "utf8",
        });
        console.info(`${verb}: ${todo}`);
        try {
            await client.query(contents);
        } catch (e) {
            console.error(`failed to run migration ${todo}`);
            throw e;
        }
        if (teardown) {
            await client.query(remove_migration_query, [todo.replace(/.undo.sql$/, ".sql")]);
        } else {
            await client.query(add_migration_query, [todo]);
        }
        console.info(`finished: ${todo}`);
    }
    console.info(`finished ${verb} database`);
}

export async function teardown(client: pg.Client | pg.Pool, migration_dir_path: string) {
    await migrate(client, migration_dir_path, true);
}
