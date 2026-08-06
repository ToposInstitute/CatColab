declare module "datascript" {
    export type Database = object;

    export function init_db(
        datoms: Array<[number, string, unknown]>,
        schema?: Record<string, Record<string, unknown>>,
    ): Database;

    export function q(query: string, database: Database, ...inputs: unknown[]): unknown;
}
