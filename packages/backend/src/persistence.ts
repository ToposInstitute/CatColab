import pg from "pg";
import * as migration from "./migration.js";

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

    async saveRef(refId: string, note: string | null): Promise<number> {
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
        await queries.autosave.run({ refId, snapshotId }, this.pool);
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
