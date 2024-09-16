import pg from "pg";
import * as migration from "./migration.js";

import assert from "node:assert/strict";
import * as uuid from "uuid";
import { type Extern, traverseExterns } from "./links.js";
import * as queries from "./queries.js";

export type Witness = queries.IGetWitnessesResult;

export type RefMeta = {
    title: string | null;
    witnesses: Witness[];
};

export type Ref = {
    id: string;
    title: string | null;
};

export class Persistence {
    pool: pg.Pool;

    constructor(url: string) {
        this.pool = new pg.Pool({
            connectionString: url,
        });
    }

    async teardown(migration_dir_path: string) {
        return migration.teardown(this.pool, migration_dir_path);
    }

    async migrate(migration_dir_path: string) {
        return migration.migrate(this.pool, migration_dir_path);
    }

    async saveSnapshot(content: string): Promise<number> {
        return (await queries.newSnapshot.run({ content }, this.pool))[0].id;
    }

    async newRef(title: string | null): Promise<string> {
        return (await queries.newRef.run({ title }, this.pool))[0].id;
    }

    async saveRef(refId: string, note: string): Promise<number> {
        assert(uuid.validate(refId));
        assert(typeof note === "string");
        return (await queries.saveRef.run({ refId, note }, this.pool))[0].id;
    }

    async allRefs(): Promise<Ref[]> {
        return await queries.getRefs.run(void 1, this.pool);
    }

    async getAutosave(refId: string): Promise<string> {
        return (await queries.getAutosave.run({ refId }, this.pool))[0].content;
    }

    async autosave(refId: string, content: string): Promise<void> {
        const snapshotId = await this.saveSnapshot(content);
        assert.strictEqual(typeof snapshotId, "number");
        await queries.autosave.run({ refId, snapshotId }, this.pool);
    }

    async autosaveWithExterns(refId: string, doc: unknown): Promise<void> {
        const externs: Extern[] = [];
        traverseExterns(doc, (e) => externs.push(e));
        await this.autosave(refId, JSON.stringify(doc));
        await this.setExterns(refId, externs);
    }

    async setExterns(refId: string, externs: Extern[]): Promise<void> {
        await queries.dropExternsFrom.run({ refId }, this.pool);
        if (externs.length > 0) {
            await queries.insertNewExterns.run(
                {
                    rows: externs.map((e) => {
                        return {
                            fromRef: refId,
                            toRef: e.refId,
                            taxon: e.taxon,
                            via: e.via,
                        };
                    }),
                },
                this.pool,
            );
        }
    }

    async getBacklinks(refId: string, taxon: string): Promise<string[]> {
        const result = await queries.getBacklinks.run({ toRef: refId, taxon }, this.pool);
        return result.map((r) => r.fromref);
    }

    async refMeta(refId: string): Promise<RefMeta> {
        const meta = (await queries.getRefMeta.run({ refId }, this.pool))[0];
        const witnesses = await queries.getWitnesses.run({ refId }, this.pool);
        return { ...meta, witnesses };
    }

    async close() {
        this.pool.end();
    }
}
