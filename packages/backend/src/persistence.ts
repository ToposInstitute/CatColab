import pg from 'pg'
import * as migration from './migration.js'

const NEW_SNAPSHOT_QUERY = `
INSERT INTO snapshots(hash, content)
    VALUES(digest($1, 'sha256'), $1)
    ON CONFLICT (hash) DO UPDATE SET
      hash = EXCLUDED.hash
    RETURNING id
`

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

    async saveSnapshot(snapshot: string) {
        return (await this.pool.query(NEW_SNAPSHOT_QUERY, [snapshot])).rows[0].id
    }

    async close() {
        this.pool.end()
    }
}
