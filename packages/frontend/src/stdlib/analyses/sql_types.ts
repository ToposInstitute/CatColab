import type { DblModel, JsResult } from "catlog-wasm";

export enum SQLBackend {
    MySQL = "MySQL",
    SQLite = "SQLite",
    PostgresSQL = "PostgresSQL",
}

export type SQLRenderer = (model: DblModel, data: string) => JsResult<string, string>;
