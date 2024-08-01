import pg from 'pg'
import * as migration from './migration.js'

declare const __phantom1: unique symbol;
declare const __phantom2: unique symbol;

type Query<P, Vs> = string & { [__phantom1]: P, [__phantom2]: Vs }
type Query1<P, V> = string & { [__phantom1]: P, [__phantom2]: V }

declare const __snapshot: unique symbol;
declare const __witness: unique symbol;
declare const __ref: unique symbol;

export type SnapshotId = number & { [__snapshot]: void }
export type WitnessId = number & { [__witness]: void }
export type RefId = string & { [__ref]: void }

export type Witness = {
    id: WitnessId,
    snapshot: SnapshotId,
    note: string | null,
    atTime: Date
}

export type RefMeta = {
    title: string,
    latest: WitnessId,
    witnesses: Witness[]
}

export type Ref = {
    id: RefId,
    title: string
}

const queries = {
    new_snapshot: `
    INSERT INTO snapshots(hash, content)
        VALUES(digest($1, 'sha256'), $1)
        ON CONFLICT (hash) DO UPDATE SET
        hash = EXCLUDED.hash
        RETURNING id
    ` as Query1<[string], { id: SnapshotId }>,

    // We should run update_ref in the same transaction but I can't figure out
    // how to get it to run correctly in another WITH clause
    new_ref: `
    INSERT INTO refs(id, title, autosave)
    VALUES (gen_random_uuid(), $2, $1)
    RETURNING id
    ` as Query1<[SnapshotId, string | null], { id: RefId }>,

    save_ref: `
    INSERT INTO witnesses(snapshot, forRef, note, atTime)
    SELECT autosave, $1, $2, NOW() FROM refs WHERE refs.id = $1
    RETURNING id
    ` as Query<[RefId, string | null], { id: WitnessId }>,

    autosave: `
    UPDATE refs
    SET autosave = $2
    WHERE id = $1
    ` as Query1<[RefId, SnapshotId], {}>,

    update_ref_latest: `
    UPDATE refs
    SET latest = $2
    WHERE id = $1
    ` as Query1<[RefId, WitnessId], {}>,

    new_witness: `
    INSERT INTO witnesses(snapshot, forRef, note, atTime)
        VALUES($2, $1, $3, NOW())
        RETURNING id;
    ` as Query1<[RefId, SnapshotId, string | null], { id: WitnessId }>,

    get_refs: `
    SELECT refs.id, refs.title
    FROM refs
    JOIN witnesses ON witnesses.id = refs.latest
    ORDER BY witnesses.atTime DESC
    ` as Query<[], Ref[]>,

    latest_snapshot: `
    SELECT snapshots.content as content
    FROM refs
    INNER JOIN witnesses ON refs.latest = witnesses.id
    INNER JOIN snapshots ON witnesses.snapshot = snapshots.id
    WHERE refs.id = $1;
    ` as Query<[RefId], { content: string }>,

    get_autosave: `
    SELECT snapshots.content as content
    FROM refs
    INNER JOIN snapshots ON refs.autosave = snapshots.id
    WHERE refs.id = $1;
    ` as Query<[RefId], { content: string }>,

    get_ref_meta: `
    SELECT title, latest FROM refs WHERE id = $1
    ` as Query1<[RefId], { title: string, latest: WitnessId }>,

    get_witnesses: `
    SELECT id, snapshot, note, atTime FROM witnesses WHERE forRef = $1 ORDER BY atTime
    ` as Query<[RefId], Witness[]>
}


export class Persistence {
    pool: pg.Pool

    constructor(url: string) {
        this.pool = new pg.Pool({
            connectionString: url
        })
    }

    async teardown(migration_dir_path: string) {
        return migration.teardown(this.pool, migration_dir_path)
    }

    async migrate(migration_dir_path: string) {
        return migration.migrate(this.pool, migration_dir_path)
    }

    private async query1<P, V>(query: Query1<P, V>, params: P): Promise<V> {
        const res = await this.query(query as Query<P, [V]>, params);
        return res[0]
    }

    private async query<P, V>(query: Query<P, V>, params: P): Promise<V> {
        const res = await this.pool.query({
            text: query as string,
            values: params as any[],
        });
        return res.rows as V;
    }

    async saveSnapshot(snapshot: string): Promise<SnapshotId> {
        return (await this.query1(queries.new_snapshot, [snapshot])).id;
    }

    async newRef(snapshotId: SnapshotId, title: string | null, note: string | null): Promise<RefId> {
        const refId = (await this.query1(queries.new_ref, [snapshotId, title])).id;
        this.saveRef(refId, note);
        return refId;
    }

    async saveRef(refId: RefId, note: string | null): Promise<WitnessId> {
        const id = (await this.query1(queries.save_ref, [refId, note])).id
        await this.query1(queries.update_ref_latest, [refId, id])
        return id
    }

    async allRefs(): Promise<Ref[]> {
        return (await this.query(queries.get_refs, []));
    }

    async getAutosave(ref: RefId): Promise<string> {
        return (await this.query1(queries.get_autosave, [ref])).content
    }

    async autosave(ref: RefId, content: string): Promise<void> {
        const snapshotId = await this.saveSnapshot(content);
        await this.query1(queries.autosave, [ref, snapshotId]);
    }

    async refMeta(ref: RefId): Promise<RefMeta> {
        const meta = (await this.query1(queries.get_ref_meta, [ref]));
        const witnesses = (await this.query(queries.get_witnesses, [ref]));
        return { ...meta, witnesses }
    }

    async close() {
        this.pool.end()
    }
}
