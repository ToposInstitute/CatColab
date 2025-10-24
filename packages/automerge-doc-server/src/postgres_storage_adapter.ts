import type { StorageAdapterInterface, StorageKey } from "@automerge/automerge-repo/slim";
import type { Pool, QueryResult } from "pg";

export class PostgresStorageAdapter implements StorageAdapterInterface {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    // Load the data for an exact key match
    async load(key: StorageKey): Promise<Uint8Array | undefined> {
        const result = await this.pool.query("SELECT data FROM storage WHERE key = $1", [key]);
        if (result.rows.length === 0) {
            return;
        }

        return new Uint8Array(result.rows[0].data);
    }

    // Save data by upserting based on the key
    async save(key: StorageKey, data: Uint8Array): Promise<void> {
        await this.pool.query(
            `
      INSERT INTO storage (key, data)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET data = $2
      `,
            [key, data],
        );
    }

    // Remove the entry for the exact key
    async remove(key: StorageKey): Promise<void> {
        await this.pool.query("DELETE FROM storage WHERE key = $1", [key]);
    }

    // Load all entries that have keys starting with the keyPrefix.
    async loadRange(keyPrefix: StorageKey): Promise<{ key: StorageKey; data: Uint8Array }[]> {
        let result: QueryResult<any>;
        if (keyPrefix.length === 0) {
            // If prefix is empty, return all rows.
            result = await this.pool.query("SELECT key, data FROM storage");
        } else {
            const query =
                "SELECT key, data FROM storage WHERE key[1:cardinality($1::text[])] = $1::text[]";
            result = await this.pool.query(query, [keyPrefix]);
        }

        return result.rows.map((row) => ({
            key: row.key,
            data: new Uint8Array(row.data),
        }));
    }

    // Remove all entries that have keys starting with the keyPrefix.
    async removeRange(keyPrefix: StorageKey): Promise<void> {
        if (keyPrefix.length === 0) {
            // If prefix is empty, delete all rows.
            await this.pool.query("DELETE FROM storage");
            return;
        }

        const query = "DELETE FROM storage WHERE key[1:cardinality($1::text[])] = $1::text[]";
        await this.pool.query(query, [keyPrefix]);
    }
}
